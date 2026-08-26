"""Quick check: list files visible in a given Drive folder using the saved token.

Usage: python scripts/drive_list_folder.py <folder_id>
"""
import os
import sys
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

CREDS_DIR = os.path.join(os.path.dirname(__file__), "..", ".credentials")
TOKEN_FILE = os.path.join(CREDS_DIR, "drive_token.json")

folder_id = sys.argv[1]

creds = Credentials.from_authorized_user_file(TOKEN_FILE)
if creds.expired and creds.refresh_token:
    creds.refresh(Request())

service = build("drive", "v3", credentials=creds)
resp = service.files().list(
    q=f"'{folder_id}' in parents and trashed = false",
    fields="files(id,name,mimeType,createdTime,size)",
    pageSize=50,
    orderBy="createdTime desc",
).execute()

files = resp.get("files", [])
print(f"Found {len(files)} file(s):")
for f in files:
    size = f.get("size")
    size_mb = f"{int(size) / 1_000_000:.1f} MB" if size else "?"
    print(f"- {f['name']} | {f['mimeType']} | {f['createdTime']} | {size_mb}")
