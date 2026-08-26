"""One-time script: authorize Vladyslav's Google account for read-only Drive access
and save the resulting refresh token to backend/.credentials/drive_token.json.

Run once locally: python scripts/drive_authorize.py
Opens a browser window for Google login/consent.
"""
import os
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
CREDS_DIR = os.path.join(os.path.dirname(__file__), "..", ".credentials")
CLIENT_SECRET_FILE = os.path.join(CREDS_DIR, "drive_client_secret.json")
TOKEN_FILE = os.path.join(CREDS_DIR, "drive_token.json")

flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
creds = flow.run_local_server(port=0)

with open(TOKEN_FILE, "w") as f:
    f.write(creds.to_json())

print(f"Saved token to {TOKEN_FILE}")
