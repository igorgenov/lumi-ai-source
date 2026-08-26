"""
Per-manager Google Drive OAuth — lets each manager self-authorize read access to their
own Drive with one click (standard "Sign in with Google" consent), instead of relying
on a single shared polling account that needs the "Google Meet" folder manually
re-shared every time Google rotates it (see project_meet_folder_access_fragility
memory). No Workspace Super Admin / domain-wide delegation needed — this is regular
per-user OAuth consent, same as any third-party app asking for Drive access.

Uses a separate "Web application" OAuth client (GOOGLE_DRIVE_WEB_CLIENT_ID/_SECRET)
from the existing GOOGLE_DRIVE_CLIENT_ID (a "Desktop" client restricted to localhost
redirect URIs, used by scripts/drive_authorize.py for the original shared account).
"""
from __future__ import annotations
import hashlib
import hmac
import time
import urllib.parse

import httpx

from app.core.config import settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
SCOPE = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email"
REDIRECT_URI = f"{settings.BACKEND_BASE_URL}/api/meetings/drive-oauth/callback"

STATE_TTL_SECONDS = 600  # 10 minutes — plenty for a consent click, short enough to limit replay window


def _state_secret() -> str:
    return settings.MEETINGS_POLL_SECRET or settings.GOOGLE_DRIVE_WEB_CLIENT_SECRET


def sign_state(manager_id: str) -> str:
    """manager_id + expiry, HMAC-signed — the callback endpoint is hit directly by the
    browser via Google's redirect (no auth header possible), so this signature is the
    only thing stopping someone from forging a callback that overwrites a DIFFERENT
    manager's stored token (standard OAuth CSRF-state pattern)."""
    expires = int(time.time()) + STATE_TTL_SECONDS
    payload = f"{manager_id}:{expires}"
    sig = hmac.new(_state_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def verify_state(state: str) -> str | None:
    """Returns manager_id if the state is validly signed and not expired, else None."""
    try:
        manager_id, expires_s, sig = state.rsplit(":", 2)
        expires = int(expires_s)
    except (ValueError, AttributeError):
        return None
    if time.time() > expires:
        return None
    expected = hmac.new(_state_secret().encode(), f"{manager_id}:{expires}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    return manager_id


def build_authorize_url(manager_id: str) -> str:
    params = {
        "client_id": settings.GOOGLE_DRIVE_WEB_CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        # Always show the consent screen and always return a refresh_token — without
        # this, re-authorizing an account that already granted access once comes back
        # with no refresh_token at all (Google only issues it on the FIRST consent).
        "prompt": "consent",
        "state": sign_state(manager_id),
    }
    return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"


async def exchange_code(code: str) -> dict:
    """Returns the raw token response (contains refresh_token, access_token, etc.)."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_DRIVE_WEB_CLIENT_ID,
            "client_secret": settings.GOOGLE_DRIVE_WEB_CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        resp.raise_for_status()
        return resp.json()


async def get_email(access_token: str) -> str | None:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
        if resp.status_code != 200:
            return None
        return resp.json().get("email")
