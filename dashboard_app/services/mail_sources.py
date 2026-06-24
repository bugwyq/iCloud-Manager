from __future__ import annotations

import hashlib
import threading
from typing import Any

from dashboard_app.config import settings
from dashboard_app.services.time_utils import now_iso
from dashboard_app.storage.json_store import read_json, write_json

_LOCK = threading.RLock()


def source_id(value: str) -> str:
    return hashlib.sha256(str(value or "").lower().encode("utf-8")).hexdigest()[:16]


def load_sources() -> list[dict[str, Any]]:
    payload = read_json(settings.mail_sources_path, {"sources": []})
    sources = payload.get("sources") if isinstance(payload, dict) else payload
    if not isinstance(sources, list):
        return []
    return [item for item in sources if isinstance(item, dict)]


def save_sources(sources: list[dict[str, Any]]) -> None:
    write_json(settings.mail_sources_path, {"updated_at": now_iso(), "sources": sources})


def public_source(source: dict[str, Any]) -> dict[str, Any]:
    password = str(source.get("password") or "")
    return {
        "id": str(source.get("id") or ""),
        "name": str(source.get("name") or ""),
        "email": str(source.get("email") or ""),
        "imap_host": str(source.get("imap_host") or ""),
        "imap_port": int(source.get("imap_port") or 993),
        "username": str(source.get("username") or ""),
        "use_ssl": bool(source.get("use_ssl", True)),
        "folder": str(source.get("folder") or "INBOX"),
        "enabled": bool(source.get("enabled", True)),
        "max_results": int(source.get("max_results") or 1000),
        "has_password": bool(password),
        "created_at": str(source.get("created_at") or ""),
        "updated_at": str(source.get("updated_at") or ""),
        "last_error": str(source.get("last_error") or ""),
        "last_test_at": str(source.get("last_test_at") or ""),
    }


def public_sources() -> list[dict[str, Any]]:
    return [public_source(source) for source in load_sources()]


def source_options() -> list[dict[str, Any]]:
    return [
        {"name": label_for_source(source), "email": str(source.get("email") or "")}
        for source in load_sources()
        if bool(source.get("enabled", True))
    ]


def label_for_source(source: dict[str, Any]) -> str:
    return str(source.get("name") or source.get("email") or source.get("username") or "").strip()


def find_source_for_mailbox(main_mailbox: str = "") -> dict[str, Any] | None:
    target = str(main_mailbox or "").strip().lower()
    enabled = [source for source in load_sources() if bool(source.get("enabled", True))]
    if target:
        for source in enabled:
            names = {
                str(source.get("id") or "").lower(),
                str(source.get("name") or "").lower(),
                str(source.get("email") or "").lower(),
                str(source.get("username") or "").lower(),
            }
            if target in names:
                return source
        return None
    return enabled[0] if enabled else None


def enabled_sources_for_mailbox(main_mailbox: str = "") -> list[dict[str, Any]]:
    target = str(main_mailbox or "").strip()
    if target:
        source = find_source_for_mailbox(target)
        return [source] if source else []
    return [source for source in load_sources() if bool(source.get("enabled", True))]


def has_source_for_mailbox(main_mailbox: str = "") -> bool:
    return bool(enabled_sources_for_mailbox(main_mailbox))


def save_source(payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name") or payload.get("email") or payload.get("username") or "").strip()
    email = str(payload.get("email") or name).strip()
    username = str(payload.get("username") or email).strip()
    imap_host = str(payload.get("imap_host") or "").strip()
    password = str(payload.get("password") or "")
    folder = str(payload.get("folder") or "INBOX").strip() or "INBOX"
    if not name:
        raise ValueError("主邮箱名称不能为空")
    if not imap_host:
        raise ValueError("IMAP 服务器不能为空")
    if not username:
        raise ValueError("IMAP 用户名不能为空")

    try:
        imap_port = int(payload.get("imap_port") or 993)
    except (TypeError, ValueError):
        raise ValueError("IMAP 端口必须是数字") from None
    if imap_port < 1 or imap_port > 65535:
        raise ValueError("IMAP 端口不正确")
    try:
        max_results = int(payload.get("max_results") or 1000)
    except (TypeError, ValueError):
        max_results = 1000
    max_results = max(1, min(max_results, 1000))

    sid = str(payload.get("id") or source_id(name or email or username))
    now = now_iso()
    with _LOCK:
        sources = load_sources()
        existing = next((item for item in sources if str(item.get("id")) == sid), None)
        if existing is None:
            existing = next(
                (
                    item
                    for item in sources
                    if str(item.get("name") or "").lower() == name.lower()
                    or str(item.get("email") or "").lower() == email.lower()
                ),
                None,
            )
        if existing is None:
            existing = {"id": sid, "created_at": now}
            sources.append(existing)
        existing.update(
            {
                "id": str(existing.get("id") or sid),
                "name": name,
                "email": email,
                "imap_host": imap_host,
                "imap_port": imap_port,
                "username": username,
                "use_ssl": bool(payload.get("use_ssl", True)),
                "folder": folder,
                "enabled": bool(payload.get("enabled", True)),
                "max_results": max_results,
                "updated_at": now,
            }
        )
        if password:
            existing["password"] = password
        elif "password" not in existing:
            raise ValueError("IMAP 密码或授权码不能为空")
        save_sources(sorted(sources, key=lambda item: label_for_source(item).lower()))
        return public_source(existing)


def delete_source(source_id_value: str) -> tuple[bool, list[dict[str, Any]]]:
    sid = str(source_id_value or "").strip()
    if not sid:
        return False, public_sources()
    with _LOCK:
        sources = load_sources()
        kept = [source for source in sources if str(source.get("id")) != sid]
        if len(kept) == len(sources):
            return False, public_sources()
        save_sources(kept)
        return True, [public_source(source) for source in kept]


def mark_source_error(source_id_value: str, error: str) -> None:
    with _LOCK:
        sources = load_sources()
        for source in sources:
            if str(source.get("id")) == str(source_id_value):
                source["last_error"] = str(error or "")
                source["last_test_at"] = now_iso()
                source["updated_at"] = now_iso()
                save_sources(sources)
                return


def mark_source_ok(source_id_value: str) -> None:
    with _LOCK:
        sources = load_sources()
        for source in sources:
            if str(source.get("id")) == str(source_id_value):
                source["last_error"] = ""
                source["last_test_at"] = now_iso()
                source["updated_at"] = now_iso()
                save_sources(sources)
                return
