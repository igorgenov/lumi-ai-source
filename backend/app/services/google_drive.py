"""
Google Drive access for the meetings pipeline.
Uses a long-lived refresh token (obtained once via scripts/drive_authorize.py)
to read recordings from the sales managers' Drive folders — no interactive
login needed in production.
"""
from __future__ import annotations
import io

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from app.core.config import settings

VIDEO_MIME_TYPES = ("video/mp4", "video/webm", "video/quicktime")


def _get_credentials(refresh_token: str | None = None) -> Credentials:
    """Defaults to the original shared-account credentials (Desktop OAuth client). Pass
    `refresh_token` to instead impersonate a specific manager who self-authorized via
    the per-manager web OAuth flow (google_drive_oauth.py) — that flow uses a separate
    "Web application" client, since Desktop clients can't use real HTTPS redirect URIs."""
    if refresh_token:
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            client_id=settings.GOOGLE_DRIVE_WEB_CLIENT_ID,
            client_secret=settings.GOOGLE_DRIVE_WEB_CLIENT_SECRET,
            token_uri="https://oauth2.googleapis.com/token",
            scopes=["https://www.googleapis.com/auth/drive.readonly"],
        )
    else:
        creds = Credentials(
            token=None,
            refresh_token=settings.GOOGLE_DRIVE_REFRESH_TOKEN,
            client_id=settings.GOOGLE_DRIVE_CLIENT_ID,
            client_secret=settings.GOOGLE_DRIVE_CLIENT_SECRET,
            token_uri="https://oauth2.googleapis.com/token",
            scopes=["https://www.googleapis.com/auth/drive.readonly"],
        )
    creds.refresh(Request())
    return creds


def _get_drive_service(refresh_token: str | None = None):
    return build("drive", "v3", credentials=_get_credentials(refresh_token))


def get_access_token() -> str:
    """Fresh access token for direct REST calls (e.g. streaming media with Range support,
    which the googleapiclient helpers don't expose)."""
    return _get_credentials().token


def get_connected_account_email() -> str:
    """Email of the Google account whose refresh token is configured — a manager's
    folder must be shared with this exact account for its recordings to be found."""
    service = _get_drive_service()
    return service.about().get(fields="user").execute()["user"]["emailAddress"]


def _list_subfolder_ids(service, folder_id: str) -> list[str]:
    """Direct (one level deep) subfolders of folder_id — cheap, small result set (a
    manager's recordings folder has at most a handful of meetings per day)."""
    resp = service.files().list(
        q=f"'{folder_id}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'",
        fields="files(id)",
        pageSize=100,
    ).execute()
    return [f["id"] for f in resp.get("files", [])]


def _find_owner_meet_root_folders(service, owner_email: str) -> list[str]:
    """All folders literally named "Google Meet" currently owned by this account and
    shared with us. Google's July 2026 recording-organization rollout does NOT keep one
    stable root folder per user forever — confirmed live 2026-08-13: two different
    managers each had a SECOND, separate "Google Meet" root folder appear two days
    after the first one, and today's meetings landed in that new one. A saved
    meeting_sources.folder_id therefore silently goes stale whenever Google rotates to
    a new root — discover the CURRENT set fresh on every poll instead of trusting one
    saved ID (also per Google's own admin guidance: "audit any API scripts... that rely
    on specific folder names or IDs")."""
    resp = service.files().list(
        q=f"mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = 'Google Meet' and '{owner_email}' in owners",
        fields="files(id)",
        pageSize=20,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()
    return [f["id"] for f in resp.get("files", [])]


def list_recordings(folder_id: str, since: str | None = None, limit: int = 20, owner_email: str | None = None, refresh_token: str | None = None) -> list[dict]:
    """List video recordings in a folder, newest first.
    If `since` (RFC3339 timestamp) is given, only recordings created after it are returned —
    keeps us from ever bulk-transcribing years of pre-existing history in one go.

    Checks one level of subfolders under folder_id — Google Meet's new recording layout
    (rolled out July-August 2026) creates a dedicated subfolder per meeting instead of
    dropping the file directly into the shared "Meet Recordings" folder.

    If `owner_email` is given, ALSO discovers and scans every current "Google Meet" root
    folder owned by that account (see _find_owner_meet_root_folders) — folder_id alone
    is kept only as a backward-compatible extra source, since it can go stale (see
    above).

    If `refresh_token` is given (a manager who self-authorized via the per-manager OAuth
    flow, google_drive_oauth.py), the search runs AS that manager instead of the shared
    polling account — sees their entire Drive directly, no manual re-sharing ever needed
    again. `owner_email` still narrows the "Google Meet" folder search when both are set."""
    service = _get_drive_service(refresh_token)
    mime_query = " or ".join(f"mimeType='{m}'" for m in VIDEO_MIME_TYPES)

    root_ids = [folder_id] if folder_id else []
    if owner_email:
        try:
            for fid in _find_owner_meet_root_folders(service, owner_email):
                if fid not in root_ids:
                    root_ids.append(fid)
        except Exception as e:
            print(f"[google_drive] failed to discover Google Meet root folders for {owner_email}: {e}")
    elif refresh_token:
        # Impersonating the manager directly — every "Google Meet" folder found this way
        # is trivially theirs (it's their own Drive), no owner filter needed.
        try:
            resp = service.files().list(
                q="mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = 'Google Meet'",
                fields="files(id)", pageSize=20,
            ).execute()
            for f in resp.get("files", []):
                if f["id"] not in root_ids:
                    root_ids.append(f["id"])
        except Exception as e:
            print(f"[google_drive] failed to discover own Google Meet root folders: {e}")

    if not root_ids:
        return []

    parent_ids = list(root_ids)
    for rid in root_ids:
        parent_ids += _list_subfolder_ids(service, rid)
    parents_query = " or ".join(f"'{pid}' in parents" for pid in parent_ids)
    q = f"({parents_query}) and trashed = false and ({mime_query})"
    if since:
        q += f" and createdTime > '{since}'"
    resp = service.files().list(
        q=q,
        fields="files(id,name,createdTime,size,webViewLink)",
        pageSize=limit,
        orderBy="createdTime desc",
    ).execute()
    return resp.get("files", [])


def download_recording(file_id: str, local_path: str, refresh_token: str | None = None) -> None:
    """Stream a recording to a local file path. Pass the same `refresh_token` used to
    find the file in list_recordings — a manager-owned file that was never manually
    shared with the polling account is only downloadable as that manager."""
    service = _get_drive_service(refresh_token)
    request = service.files().get_media(fileId=file_id)
    with io.FileIO(local_path, "wb") as fh:
        downloader = MediaIoBaseDownload(fh, request, chunksize=10 * 1024 * 1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()
