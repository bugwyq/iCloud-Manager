from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from dashboard_app.utils.text import html_to_text


CODE_CONTEXT_RE = re.compile(
    r"(?i)(?:验证码|登录代码|动态码|校验码|验证代码|verification code|login code|one[-\s]?time code|security code|code)"
    r"[^\d]{0,100}(\d(?:[\s-]?\d){3,7})"
)
STANDALONE_CODE_RE = re.compile(r"(?<!\d)(\d{4,8})(?!\d)")
HTML_TITLE_RE = re.compile(r"(?is)<title[^>]*>(.*?)</title>")
LOOSE_MSG_RE = re.compile(
    r'(?is)\{\s*"status"\s*:\s*true\s*,\s*"msg"\s*:\s*"(.*?)"\s*,\s*"time"\s*:\s*"([^"]*)"',
)


def _message_id(account_id: str, index: int, values: list[str]) -> str:
    raw = "|".join([account_id, str(index), *values])
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()[:18]


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value).strip()
    return json.dumps(value, ensure_ascii=False)


def _pick_raw(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    lowered = {str(key).lower(): value for key, value in item.items()}
    for key in keys:
        if key in lowered:
            text = _stringify(lowered[key])
            if text:
                return lowered[key]
    return ""


def _pick(item: dict[str, Any], keys: tuple[str, ...]) -> str:
    value = _pick_raw(item, keys)
    if not value:
        return ""
    return _stringify(value)


def _looks_like_html(value: Any) -> bool:
    text = _stringify(value)
    if not text:
        return False
    head = text[:3000].lower()
    return any(
        marker in head
        for marker in (
            "<!doctype",
            "<html",
            "<head",
            "<body",
            "<style",
            "<table",
            "<div",
            "<span",
            "<img",
            "<a ",
            "<p",
            "<br",
        )
    )


def _html_from_item(item: dict[str, Any], raw_body: Any) -> str:
    direct = _pick_raw(
        item,
        (
            "raw_html",
            "html",
            "body_html",
            "content_html",
            "email_html",
            "message_html",
        ),
    )
    if direct and _looks_like_html(direct):
        return _stringify(direct)
    if raw_body and _looks_like_html(raw_body):
        return _stringify(raw_body)
    return ""


def _looks_like_message(item: dict[str, Any]) -> bool:
    keys = {str(key).lower() for key in item.keys()}
    hints = {
        "subject",
        "title",
        "from",
        "sender",
        "body",
        "content",
        "html",
        "text",
        "msg",
        "date",
        "time",
        "received_at",
        "created_at",
    }
    return bool(keys & hints)


def _collect_message_candidates(payload: Any) -> list[Any]:
    candidates: list[Any] = []

    def walk(value: Any) -> None:
        if isinstance(value, list):
            for child in value:
                walk(child)
            return
        if isinstance(value, dict):
            if _looks_like_message(value):
                candidates.append(value)
                return
            for key in (
                "messages",
                "mails",
                "mail",
                "emails",
                "items",
                "rows",
                "list",
                "data",
                "result",
                "msg",
                "message",
                "content",
                "body",
                "records",
            ):
                if key in value:
                    walk(value.get(key))
            return
        if isinstance(value, str) and value.strip():
            candidates.append(value)

    walk(payload)
    return candidates


def _title_from_html(html: str) -> str:
    match = HTML_TITLE_RE.search(html or "")
    return html_to_text(match.group(1)) if match else ""


def _plain_text(value: str) -> str:
    return str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def _body_from_raw(value: Any) -> str:
    if not value:
        return ""
    if _looks_like_html(value):
        return html_to_text(_stringify(value))
    if isinstance(value, str):
        return _plain_text(value)
    return html_to_text(_stringify(value))


def _unescape_loose_json_text(value: str) -> str:
    text = str(value or "")
    replacements = (
        ("\\r\\n", "\n"),
        ("\\n", "\n"),
        ("\\r", "\n"),
        ("\\t", "\t"),
        ('\\"', '"'),
        ("\\\\", "\\"),
    )
    for old, new in replacements:
        text = text.replace(old, new)
    return _plain_text(text)


def _loose_json_message(text: str) -> dict[str, Any] | None:
    match = LOOSE_MSG_RE.search(text or "")
    if not match:
        return None
    return {
        "msg": _unescape_loose_json_text(match.group(1)),
        "time": _unescape_loose_json_text(match.group(2)),
    }


def _clean_code(raw: str) -> str:
    return re.sub(r"\D+", "", raw or "")


def _extract_verification_code(*values: str) -> str:
    text = "\n".join(str(value or "") for value in values if value)
    if not text:
        return ""
    match = CODE_CONTEXT_RE.search(text)
    if match:
        code = _clean_code(match.group(1))
        if 4 <= len(code) <= 8:
            return code

    normalized = " ".join(text.split())
    if len(normalized) > 260:
        return ""
    for match in STANDALONE_CODE_RE.finditer(text):
        code = match.group(1)
        if len(code) == 4 and code.startswith(("19", "20")):
            continue
        return code
    return ""


def _normalize_message(account_id: str, index: int, item: Any) -> dict[str, Any]:
    html = ""
    if isinstance(item, dict):
        sender = _pick(item, ("from", "sender", "from_email", "from_name", "mail_from"))
        receiver = _pick(item, ("to", "receiver", "recipient", "mail_to"))
        subject = _pick(item, ("subject", "title", "name")) or "无主题"
        date = _pick(item, ("date", "time", "received_at", "created_at", "sent_at", "timestamp"))
        raw_body = _pick_raw(item, ("body", "content", "html", "text", "message", "msg", "detail", "value"))
        html = _html_from_item(item, raw_body)
        if subject == "无主题" and html:
            subject = _title_from_html(html) or subject
        body = _body_from_raw(raw_body)
        if not body:
            body = html_to_text(json.dumps(item, ensure_ascii=False))
    else:
        sender = ""
        receiver = ""
        subject = "原始邮件内容"
        date = ""
        html = _stringify(item) if _looks_like_html(item) else ""
        body = html_to_text(str(item))

    message: dict[str, Any] = {
        "id": _message_id(account_id, index, [sender, receiver, subject, date, body[:300]]),
        "from": sender,
        "to": receiver,
        "subject": subject,
        "date": date,
        "body": body,
        "render_mode": "html" if html else "text",
    }
    code = _extract_verification_code(subject, body)
    if code:
        message["verification_code"] = code
        if subject in {"无主题", "原始邮件内容"}:
            message["subject"] = f"验证码 {code}"
    if html:
        message["html"] = html
    return message


def messages_from_response(text: str, content_type: str, account_id: str) -> tuple[list[dict[str, Any]], str]:
    stripped = text.strip()
    if stripped:
        try:
            payload = json.loads(stripped)
            candidates = _collect_message_candidates(payload)
            messages = [_normalize_message(account_id, idx, item) for idx, item in enumerate(candidates)]
            return messages, "json"
        except json.JSONDecodeError:
            loose = _loose_json_message(stripped)
            if loose:
                return [_normalize_message(account_id, 0, loose)], "json"

    parse_mode = "html" if "html" in content_type.lower() else "text"
    if parse_mode == "html" or _looks_like_html(text):
        return [_normalize_message(account_id, 0, text)], parse_mode

    plain = html_to_text(text)
    if not plain:
        return [], "text"
    return [_normalize_message(account_id, 0, plain)], parse_mode
