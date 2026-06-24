from __future__ import annotations

from pathlib import Path
from typing import Any

from dashboard_app.services.accounts import (
    STORE_LOCK,
    account_id,
    default_main_mailbox,
    load_accounts,
    public_accounts,
    save_accounts,
)
from dashboard_app.services.cache import delete_cache
from dashboard_app.services.links import build_show_url
from dashboard_app.services.mail_sources import has_source_for_mailbox
from dashboard_app.services.time_utils import now_iso
from dashboard_app.utils.text import extract_email, extract_url, source_host


def parse_import_text(text: str, main_mailbox: str = "") -> dict[str, Any]:
    now = now_iso()
    mailbox_label = str(main_mailbox or "").strip() or default_main_mailbox()
    lines = str(text or "").replace("\ufeff", "").splitlines()
    stats = {
        "total_lines": 0,
        "imported": 0,
        "updated": 0,
        "duplicates": 0,
        "skipped_non_icloud": 0,
        "skipped_invalid": 0,
        "missing_source": 0,
        "generated_source": 0,
    }
    samples: dict[str, list[str]] = {"invalid": [], "non_icloud": [], "missing_source": []}
    scan_ids: list[str] = []
    seen_scan_ids: set[str] = set()

    with STORE_LOCK:
        accounts = load_accounts()
        by_email = {str(item.get("email", "")).lower(): item for item in accounts}
        for raw_line in lines:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            stats["total_lines"] += 1
            email = extract_email(line)
            if not email:
                stats["skipped_invalid"] += 1
                if len(samples["invalid"]) < 5:
                    samples["invalid"].append(line[:120])
                continue
            if not email.endswith("@icloud.com"):
                stats["skipped_non_icloud"] += 1
                if len(samples["non_icloud"]) < 5:
                    samples["non_icloud"].append(email)
                continue

            legacy_url = extract_url(line)
            source_url = build_show_url(email, public=False)
            if source_url:
                stats["generated_source"] += 1

            existing = by_email.get(email)
            if existing:
                existing_id = str(existing.get("id") or "")
                changed = False
                if source_url and source_url != existing.get("source_url"):
                    delete_cache(existing_id)
                    existing["source_url"] = source_url
                    existing["source_host"] = source_host(source_url)
                    existing["last_fetch_at"] = ""
                    existing["last_message_count"] = 0
                    existing["last_error"] = ""
                    existing["mail_status"] = ""
                    changed = True
                if legacy_url and legacy_url != existing.get("legacy_source_url"):
                    existing["legacy_source_url"] = legacy_url
                    changed = True
                if mailbox_label and mailbox_label != str(existing.get("main_mailbox") or ""):
                    existing["main_mailbox"] = mailbox_label
                    changed = True
                if changed:
                    existing["updated_at"] = now
                    stats["updated"] += 1
                else:
                    stats["duplicates"] += 1
                if _can_scan(mailbox_label) and existing_id and existing_id not in seen_scan_ids:
                    seen_scan_ids.add(existing_id)
                    scan_ids.append(existing_id)
                elif not _can_scan(mailbox_label):
                    stats["missing_source"] += 1
                    if len(samples["missing_source"]) < 5:
                        samples["missing_source"].append(email)
                continue

            account = {
                "id": account_id(email),
                "email": email,
                "main_mailbox": mailbox_label,
                "source_url": source_url,
                "source_host": source_host(source_url),
                "legacy_source_url": legacy_url,
                "created_at": now,
                "updated_at": now,
                "last_fetch_at": "",
                "last_message_count": 0,
                "last_error": "" if _can_scan(mailbox_label) else "未配置主邮箱收信源",
                "mail_status": "",
            }
            accounts.append(account)
            by_email[email] = account
            stats["imported"] += 1
            if _can_scan(mailbox_label) and account["id"] not in seen_scan_ids:
                seen_scan_ids.add(str(account["id"]))
                scan_ids.append(str(account["id"]))
            elif not _can_scan(mailbox_label):
                stats["missing_source"] += 1
                if len(samples["missing_source"]) < 5:
                    samples["missing_source"].append(email)

        accounts.sort(key=lambda item: str(item.get("email", "")))
        save_accounts(accounts)

    return {
        "ok": True,
        "stats": stats,
        "samples": samples,
        "scan_ids": scan_ids,
        "accounts": public_accounts(accounts),
    }


def import_text_file(path: str | Path) -> dict[str, Any]:
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    return parse_import_text(text)


def _can_scan(main_mailbox: str) -> bool:
    return has_source_for_mailbox(str(main_mailbox or "").strip())
