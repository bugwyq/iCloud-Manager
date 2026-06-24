from __future__ import annotations

from typing import Any

from dashboard_app.services.accounts import (
    STORE_LOCK,
    find_account,
    public_account,
    save_accounts,
)
from dashboard_app.services.cache import delete_cache, load_cache, save_cache
from dashboard_app.services.imap_mail import fetch_messages_for_alias
from dashboard_app.services.links import build_show_url
from dashboard_app.services.mail_sources import (
    enabled_sources_for_mailbox,
    find_source_for_mailbox,
    label_for_source,
    mark_source_error,
    mark_source_ok,
)
from dashboard_app.services.time_utils import now_iso

_NO_HISTORY_MESSAGE = "无历史邮件"


def fetch_mail_for_account(account_id: str, force: bool = False, record_error: bool = True) -> dict[str, Any]:
    accounts, account = find_account(account_id)
    if not account:
        return {"ok": False, "error": "邮箱不存在"}

    cached = load_cache(account_id)
    if cached and cache_has_source_error(cached):
        delete_cache(account_id)
        cached = None
    if cached and not force:
        cached["cached"] = True
        return {"ok": True, "account": public_account(account), "cache": cached}

    email = str(account.get("email") or account_id).strip()
    main_mailbox = str(account.get("main_mailbox") or "").strip()
    source = find_source_for_mailbox(main_mailbox)
    if not source:
        message = "未配置主邮箱收信源"
        if main_mailbox:
            message = f"未配置主邮箱「{main_mailbox}」的收信源"
        return _mark_fetch_error(account_id, message, record_error=record_error)

    try:
        messages = fetch_messages_for_alias(email, source)
    except Exception as exc:
        error = f"IMAP 收信失败：{exc}"
        mark_source_error(str(source.get("id") or ""), error)
        return _mark_fetch_error(account_id, error, fetched=True, record_error=record_error)

    mark_source_ok(str(source.get("id") or ""))
    source_label = label_for_source(source)
    source_url = _source_snapshot_url(source)
    if not messages:
        return _mark_no_history(account_id, source_url, source_label, _NO_HISTORY_MESSAGE)

    for message in messages:
        if message.get("html"):
            message["base_url"] = ""

    fetched_at = now_iso()
    cache = {
        "render_version": 7,
        "account_id": account.get("id"),
        "email": account.get("email"),
        "source_host": str(source.get("imap_host") or ""),
        "source_url": source_url,
        "account_source_url": build_show_url(email, public=True),
        "source_label": source_label,
        "fetched_at": fetched_at,
        "status_code": 200,
        "content_type": "application/x-imap",
        "parse_mode": "imap",
        "raw_response": "",
        "message_count": len(messages),
        "messages": messages,
        "cached": False,
    }

    with STORE_LOCK:
        save_cache(str(account.get("id")), cache)
        accounts2, account2 = find_account(account_id)
        if account2:
            account2["main_mailbox"] = str(account2.get("main_mailbox") or source_label)
            account2["source_host"] = str(source.get("imap_host") or "")
            account2["source_url"] = build_show_url(email, public=False)
            account2["last_fetch_at"] = fetched_at
            account2["last_message_count"] = len(messages)
            account2["last_error"] = ""
            account2["mail_status"] = ""
            account2["updated_at"] = fetched_at
            save_accounts(accounts2)
        return {"ok": True, "account": public_account(account2 or {}), "cache": cache}


def fetch_mail_for_email(alias_email: str, main_mailbox: str = "") -> dict[str, Any]:
    sources = enabled_sources_for_mailbox(main_mailbox)
    if not sources:
        return {
            "ok": False,
            "error": "未配置主邮箱收信源",
            "email": alias_email,
            "cache": None,
        }

    errors: list[str] = []
    for source in sources:
        try:
            messages = fetch_messages_for_alias(alias_email, source)
        except Exception as exc:
            error = f"{label_for_source(source) or source.get('imap_host')}: {exc}"
            errors.append(error)
            mark_source_error(str(source.get("id") or ""), str(exc))
            continue

        mark_source_ok(str(source.get("id") or ""))
        source_label = label_for_source(source)
        source_url = _source_snapshot_url(source)
        cache = {
            "render_version": 7,
            "account_id": "",
            "email": alias_email,
            "source_host": str(source.get("imap_host") or ""),
            "source_url": source_url,
            "account_source_url": build_show_url(alias_email, public=True),
            "source_label": source_label,
            "fetched_at": now_iso(),
            "status_code": 200,
            "content_type": "application/x-imap",
            "parse_mode": "imap",
            "raw_response": "",
            "message_count": len(messages),
            "messages": messages,
            "cached": False,
            "no_history": not bool(messages),
            "message": "" if messages else _NO_HISTORY_MESSAGE,
        }
        return {"ok": True, "email": alias_email, "cache": cache}

    return {
        "ok": False,
        "error": "；".join(errors) if errors else "IMAP 收信失败",
        "email": alias_email,
        "cache": None,
    }


def cache_has_source_error(cache: dict[str, Any] | None) -> bool:
    if not cache:
        return False
    if int(cache.get("render_version") or 0) < 7:
        source = str(cache.get("source_url") or cache.get("account_source_url") or "")
        if "/show/" in source and "127.0.0.1" in source:
            return True
    raw = str(cache.get("raw_response") or "")
    lowered = raw[:5000].lower()
    return any(
        marker in lowered
        for marker in (
            "icloud hide my email 管理",
            "icloudmailpanel",
            "/_next/static/chunks/app/page-",
            "mail-viewer",
        )
    )


def _mark_no_history(
    account_id: str,
    source_url: str,
    source_label: str,
    message: str,
) -> dict[str, Any]:
    fetched_at = now_iso()
    with STORE_LOCK:
        accounts, account = find_account(account_id)
        if not account:
            return {"ok": False, "error": "邮箱不存在"}
        email = str(account.get("email") or account_id)
        cache = {
            "render_version": 7,
            "account_id": account.get("id"),
            "email": email,
            "source_host": source_label,
            "source_url": source_url,
            "account_source_url": build_show_url(email, public=True),
            "source_label": source_label,
            "fetched_at": fetched_at,
            "status_code": 200,
            "content_type": "application/x-imap",
            "parse_mode": "imap",
            "message_count": 0,
            "messages": [],
            "no_history": True,
            "message": message,
            "cached": False,
        }
        save_cache(str(account.get("id")), cache)
        account["last_fetch_at"] = fetched_at
        account["last_message_count"] = 0
        account["last_error"] = ""
        account["mail_status"] = "no_history"
        account["updated_at"] = fetched_at
        save_accounts(accounts)
        return {"ok": True, "account": public_account(account), "cache": cache}


def _mark_fetch_error(
    account_id: str,
    error: str,
    *,
    clear_existing_cache: bool = False,
    fetched: bool = False,
    record_error: bool = True,
) -> dict[str, Any]:
    if clear_existing_cache:
        delete_cache(account_id)
    if not record_error:
        return {"ok": False, "error": error, "email": account_id}
    account: dict[str, Any] | None = None
    with STORE_LOCK:
        accounts, account = find_account(account_id)
        if account:
            if clear_existing_cache:
                account["last_message_count"] = 0
            if fetched:
                account["last_fetch_at"] = now_iso()
            account["last_error"] = error
            account["mail_status"] = ""
            account["updated_at"] = now_iso()
            save_accounts(accounts)
    return {"ok": False, "error": error, "email": (account or {}).get("email", account_id)}


def _source_snapshot_url(source: dict[str, Any]) -> str:
    host = str(source.get("imap_host") or "").strip()
    folder = str(source.get("folder") or "INBOX").strip() or "INBOX"
    return f"imap://{host}/{folder}" if host else "imap://local/INBOX"
