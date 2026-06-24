from __future__ import annotations

import hashlib
import threading
from typing import Any

from dashboard_app.config import settings
from dashboard_app.services.cache import cache_summaries, delete_cache, has_cache
from dashboard_app.services.links import build_show_url
from dashboard_app.services.mail_sources import (
    find_source_for_mailbox,
    has_source_for_mailbox,
    label_for_source,
    source_options,
)
from dashboard_app.services.time_utils import now_iso
from dashboard_app.storage.json_store import ensure_dir, read_json, write_json
from dashboard_app.utils.text import source_host

STORE_LOCK = threading.RLock()


def ensure_storage() -> None:
    ensure_dir(settings.data_dir)
    ensure_dir(settings.cache_dir)


def account_id(email: str) -> str:
    return hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:16]


def load_accounts() -> list[dict[str, Any]]:
    payload = read_json(settings.accounts_path, {"accounts": []})
    accounts = payload.get("accounts") if isinstance(payload, dict) else payload
    if not isinstance(accounts, list):
        return []
    return [item for item in accounts if isinstance(item, dict) and item.get("email")]


def save_accounts(accounts: list[dict[str, Any]]) -> None:
    ensure_storage()
    write_json(settings.accounts_path, {"updated_at": now_iso(), "accounts": accounts})


def find_account(account_id_value: str) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    accounts = load_accounts()
    for account in accounts:
        if str(account.get("id")) == str(account_id_value):
            return accounts, account
    return accounts, None


def public_account(account: dict[str, Any], cache_summary: dict[str, Any] | None = None) -> dict[str, Any]:
    source_url = str(account.get("source_url") or "")
    item_id = str(account.get("id", ""))
    main_mailbox = _main_mailbox_label(account)
    source = find_source_for_mailbox(main_mailbox)
    has_source = bool(source)
    source_label = label_for_source(source) if source else main_mailbox
    summary = cache_summary if cache_summary is not None else _single_cache_summary(item_id)
    no_history = bool(account.get("mail_status") == "no_history" or summary.get("no_history"))
    return {
        "id": item_id,
        "email": account.get("email", ""),
        "main_mailbox": source_label,
        "source_host": str(source.get("imap_host") or "") if source else account.get("source_host") or source_host(source_url),
        "source_url": source_url,
        "has_source": has_source,
        "created_at": account.get("created_at", ""),
        "updated_at": account.get("updated_at", ""),
        "last_fetch_at": account.get("last_fetch_at", ""),
        "last_message_count": int(account.get("last_message_count") or 0),
        "last_error": account.get("last_error", ""),
        "cached": bool(summary.get("cached")),
        "no_history": no_history,
    }


def public_accounts(accounts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries = cache_summaries([str(account.get("id", "")) for account in accounts])
    return [public_account(account, summaries.get(str(account.get("id", "")), {})) for account in accounts]


def account_has_source(account: dict[str, Any]) -> bool:
    return has_source_for_mailbox(_main_mailbox_label(account))


def account_stats(accounts: list[dict[str, Any]]) -> dict[str, int]:
    summaries = cache_summaries([str(item.get("id", "")) for item in accounts])
    return {
        "total": len(accounts),
        "with_source": sum(1 for item in accounts if account_has_source(item)),
        "cached": len(summaries),
        "errors": sum(1 for item in accounts if item.get("last_error")),
        "messages": sum(int(item.get("last_message_count") or 0) for item in accounts),
        "main_mailboxes": len(main_mailbox_options(accounts)),
    }


def _single_cache_summary(account_id_value: str) -> dict[str, Any]:
    summary = cache_summaries([account_id_value]).get(account_id_value)
    if summary is not None:
        return summary
    return {"cached": has_cache(account_id_value), "no_history": False}


def remove_account(account_id_value: str) -> tuple[bool, list[dict[str, Any]]]:
    with STORE_LOCK:
        accounts = load_accounts()
        kept = [item for item in accounts if str(item.get("id")) != account_id_value]
        if len(kept) == len(accounts):
            return False, accounts
        save_accounts(kept)
        delete_cache(account_id_value)
        return True, kept


def remove_accounts(account_ids: list[str]) -> tuple[int, list[dict[str, Any]]]:
    targets = {str(item) for item in account_ids if str(item or "").strip()}
    if not targets:
        return 0, load_accounts()
    with STORE_LOCK:
        accounts = load_accounts()
        removed_ids = [str(item.get("id")) for item in accounts if str(item.get("id")) in targets]
        kept = [item for item in accounts if str(item.get("id")) not in targets]
        if not removed_ids:
            return 0, accounts
        save_accounts(kept)
        for account_id_value in removed_ids:
            delete_cache(account_id_value)
        return len(removed_ids), kept


def remove_by_main_mailbox(main_mailbox: str) -> tuple[int, list[dict[str, Any]]]:
    target = str(main_mailbox or "").strip()
    if not target:
        return 0, load_accounts()
    with STORE_LOCK:
        accounts = load_accounts()
        removed_ids = [
            str(item.get("id"))
            for item in accounts
            if _main_mailbox_label(item) == target
        ]
        kept = [
            item
            for item in accounts
            if _main_mailbox_label(item) != target
        ]
        if not removed_ids:
            return 0, accounts
        save_accounts(kept)
        for account_id_value in removed_ids:
            delete_cache(account_id_value)
        return len(removed_ids), kept


def main_mailbox_options(accounts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for account in accounts:
        name = _main_mailbox_label(account)
        if not name:
            continue
        counts[name] = counts.get(name, 0) + 1
    for option in source_options():
        name = str(option.get("name") or "").strip()
        if name and name not in counts:
            counts[name] = 0
    return [{"name": name, "count": counts[name]} for name in sorted(counts, key=str.lower)]


def default_main_mailbox() -> str:
    options = source_options()
    return str(options[0].get("name") or "") if options else ""


def _main_mailbox_label(account: dict[str, Any]) -> str:
    explicit = str(account.get("main_mailbox") or account.get("source_mailbox") or "").strip()
    if explicit:
        return explicit
    source_url = str(account.get("source_url") or "")
    return str(account.get("source_host") or source_host(source_url) or default_main_mailbox()).strip()


def export_accounts(account_ids: list[str]) -> str:
    targets = {str(item) for item in account_ids if str(item or "").strip()}
    accounts = load_accounts()
    rows: list[str] = []
    for account in accounts:
        account_id_value = str(account.get("id") or "")
        if targets and account_id_value not in targets:
            continue
        email = str(account.get("email") or "").strip()
        if not email:
            continue
        source_url = build_show_url(email, public=True)
        rows.append(f"{email}----{source_url}" if source_url else email)
    return "\n".join(rows) + ("\n" if rows else "")
