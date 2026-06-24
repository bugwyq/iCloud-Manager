from __future__ import annotations

import email
import email.header
import email.policy
import email.utils
import hashlib
import imaplib
import re
from contextlib import suppress
from typing import Any

from dashboard_app.config import settings
from dashboard_app.utils.text import extract_email, html_to_text


CODE_CONTEXT_RE = re.compile(
    r"(?i)(?:verification code|login code|one[-\s]?time code|security code|code|验证码|登录代码|动态码|校验码)"
    r"[^\d]{0,100}(\d(?:[\s-]?\d){3,7})"
)
STANDALONE_CODE_RE = re.compile(r"(?<!\d)(\d{4,8})(?!\d)")


def fetch_messages_for_alias(alias_email: str, source: dict[str, Any]) -> list[dict[str, Any]]:
    alias = extract_email(alias_email)
    if not alias:
        raise ValueError("邮箱格式不正确")

    max_results = _int_value(source.get("max_results"), 1000, minimum=1, maximum=1000)
    mailbox = str(source.get("folder") or "INBOX").strip() or "INBOX"
    client = _connect(source)
    try:
        status, _ = client.select(mailbox, readonly=True)
        if status != "OK":
            raise RuntimeError(f"无法打开邮箱目录 {mailbox}")
        uids = _search_alias_uids(client, alias)
        messages: list[dict[str, Any]] = []
        for uid in reversed(uids[-max_results:]):
            raw = _fetch_rfc822(client, uid)
            if not raw:
                continue
            messages.append(_parse_message(raw, alias, uid))
        return messages
    finally:
        with suppress(Exception):
            client.close()
        with suppress(Exception):
            client.logout()


def test_source(source: dict[str, Any]) -> None:
    mailbox = str(source.get("folder") or "INBOX").strip() or "INBOX"
    client = _connect(source)
    try:
        status, _ = client.select(mailbox, readonly=True)
        if status != "OK":
            raise RuntimeError(f"无法打开邮箱目录 {mailbox}")
    finally:
        with suppress(Exception):
            client.close()
        with suppress(Exception):
            client.logout()


def _connect(source: dict[str, Any]) -> imaplib.IMAP4:
    host = str(source.get("imap_host") or "").strip()
    username = str(source.get("username") or source.get("email") or "").strip()
    password = str(source.get("password") or "")
    if not host:
        raise ValueError("IMAP 服务器不能为空")
    if not username:
        raise ValueError("IMAP 用户名不能为空")
    if not password:
        raise ValueError("IMAP 密码或授权码不能为空")

    use_ssl = bool(source.get("use_ssl", True))
    port = _int_value(source.get("imap_port"), 993 if use_ssl else 143, minimum=1, maximum=65535)
    if use_ssl:
        client: imaplib.IMAP4 = imaplib.IMAP4_SSL(
            host,
            port,
            timeout=settings.fetch_timeout_seconds,
        )
    else:
        client = imaplib.IMAP4(host, port, timeout=settings.fetch_timeout_seconds)
    status, _ = client.login(username, password)
    if status != "OK":
        raise RuntimeError("IMAP 登录失败")
    return client


def _search_alias_uids(client: imaplib.IMAP4, alias: str) -> list[bytes]:
    query = _imap_quote(alias)
    criteria = [
        ("TO", query),
        ("CC", query),
        ("HEADER", "Delivered-To", query),
        ("HEADER", "X-Original-To", query),
        ("TEXT", query),
    ]
    seen: set[bytes] = set()
    ordered: list[bytes] = []
    for criterion in criteria:
        with suppress(Exception):
            status, data = client.uid("SEARCH", None, *criterion)
            if status != "OK" or not data:
                continue
            for uid in b" ".join(part for part in data if part).split():
                if uid and uid not in seen:
                    seen.add(uid)
                    ordered.append(uid)
    ordered.sort(key=lambda value: int(value or b"0"))
    return ordered


def _imap_quote(value: str) -> str:
    escaped = str(value or "").replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _fetch_rfc822(client: imaplib.IMAP4, uid: bytes) -> bytes:
    status, data = client.uid("FETCH", uid, "(RFC822)")
    if status != "OK" or not data:
        return b""
    for item in data:
        if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], bytes):
            return item[1]
    return b""


def _parse_message(raw: bytes, alias: str, uid: bytes) -> dict[str, Any]:
    msg = email.message_from_bytes(raw, policy=email.policy.default)
    subject = _decode_header_value(msg.get("subject") or "无主题")
    sender = _format_addresses(msg.get_all("from", []))
    receiver = _format_addresses(
        [
            *(msg.get_all("to", []) or []),
            *(msg.get_all("cc", []) or []),
            *(msg.get_all("delivered-to", []) or []),
            *(msg.get_all("x-original-to", []) or []),
        ]
    )
    date = _message_date(msg)
    text_body, html_body = _message_bodies(msg)
    body = text_body or html_to_text(html_body) or ""
    code = _extract_code(subject, body)
    message_id = _stable_id(alias, uid, msg.get("message-id") or "", subject, date, body[:200])
    item: dict[str, Any] = {
        "id": message_id,
        "from": sender,
        "to": receiver,
        "subject": subject,
        "date": date,
        "body": body,
        "render_mode": "html" if html_body else "text",
        "imap_uid": uid.decode("ascii", errors="ignore"),
    }
    if html_body:
        item["html"] = html_body
    if code:
        item["verification_code"] = code
        if subject in {"无主题", "原始邮件内容"}:
            item["subject"] = f"验证码 {code}"
    return item


def _message_bodies(msg: email.message.EmailMessage) -> tuple[str, str]:
    text_parts: list[str] = []
    html_parts: list[str] = []
    if msg.is_multipart():
        parts = msg.walk()
    else:
        parts = [msg]
    for part in parts:
        if part.is_multipart():
            continue
        disposition = str(part.get_content_disposition() or "").lower()
        if disposition == "attachment":
            continue
        content_type = str(part.get_content_type() or "").lower()
        if content_type not in {"text/plain", "text/html"}:
            continue
        text = _part_text(part)
        if not text:
            continue
        if content_type == "text/html":
            html_parts.append(text)
        else:
            text_parts.append(text)
    return "\n\n".join(text_parts).strip(), "\n\n".join(html_parts).strip()


def _part_text(part: email.message.Message) -> str:
    try:
        value = part.get_content()
        return str(value or "").strip()
    except Exception:
        payload = part.get_payload(decode=True)
        if not isinstance(payload, bytes):
            return ""
        charset = part.get_content_charset() or "utf-8"
        return payload.decode(charset, errors="replace").strip()


def _decode_header_value(value: str) -> str:
    parts: list[str] = []
    for chunk, charset in email.header.decode_header(str(value or "")):
        if isinstance(chunk, bytes):
            parts.append(chunk.decode(charset or "utf-8", errors="replace"))
        else:
            parts.append(str(chunk))
    return "".join(parts).strip()


def _format_addresses(values: list[str]) -> str:
    addresses = email.utils.getaddresses(values)
    formatted: list[str] = []
    for name, addr in addresses:
        name = _decode_header_value(name)
        if name and addr:
            formatted.append(f"{name} <{addr}>")
        elif addr:
            formatted.append(addr)
        elif name:
            formatted.append(name)
    return ", ".join(formatted)


def _message_date(msg: email.message.EmailMessage) -> str:
    value = str(msg.get("date") or "").strip()
    if not value:
        return ""
    with suppress(Exception):
        parsed = email.utils.parsedate_to_datetime(value)
        return parsed.isoformat()
    return value


def _extract_code(*values: str) -> str:
    text = "\n".join(value for value in values if value)
    if not text:
        return ""
    match = CODE_CONTEXT_RE.search(text)
    if match:
        code = re.sub(r"\D+", "", match.group(1))
        if 4 <= len(code) <= 8:
            return code
    normalized = " ".join(text.split())
    if len(normalized) > 260:
        return ""
    match = STANDALONE_CODE_RE.search(text)
    return match.group(1) if match else ""


def _stable_id(alias: str, uid: bytes, *values: str) -> str:
    raw = "|".join([alias, uid.decode("ascii", errors="ignore"), *values])
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()[:18]


def _int_value(value: Any, default: int, *, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(number, maximum))
