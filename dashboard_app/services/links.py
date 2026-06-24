from __future__ import annotations

import urllib.parse

from dashboard_app.config import settings
from dashboard_app.utils.text import extract_email


def public_base_url() -> str:
    return (settings.public_base_url or f"http://127.0.0.1:{settings.default_port}").rstrip("/")


def build_show_url(email: str, public: bool = True) -> str:
    address = extract_email(email)
    if not address:
        return ""
    base = public_base_url() if public else ""
    path = f"/show/{urllib.parse.quote(address)}"
    url = f"{base}{path}" if base else path
    token = str(settings.viewer_token or "").strip()
    if token:
        url = f"{url}?{urllib.parse.urlencode({'key': token})}"
    return url


def show_link_is_internal(url: str) -> bool:
    parsed = urllib.parse.urlparse(str(url or ""))
    return parsed.path == "/show" or parsed.path.startswith("/show/")
