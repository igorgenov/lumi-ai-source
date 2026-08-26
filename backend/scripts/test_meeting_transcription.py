"""Etap 0 validation: download one real Meet recording from a manager's Drive
folder and run it through AssemblyAI with speaker diarization, to check
transcription/diarization quality on Ukrainian/Russian multi-speaker audio.

Usage: python scripts/test_meeting_transcription.py <folder_id> [file_index]
"""
import os
import sys
import time

import requests
from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

CREDS_DIR = os.path.join(os.path.dirname(__file__), "..", ".credentials")
TOKEN_FILE = os.path.join(CREDS_DIR, "drive_token.json")
DOWNLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", ".tmp")
ASSEMBLYAI_KEY = os.environ["ASSEMBLYAI_API_KEY"]

folder_id = sys.argv[1]
file_index = int(sys.argv[2]) if len(sys.argv) > 2 else 0

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# 1. Find a recording in the folder
creds = Credentials.from_authorized_user_file(TOKEN_FILE)
if creds.expired and creds.refresh_token:
    creds.refresh(Request())
drive = build("drive", "v3", credentials=creds)

resp = drive.files().list(
    q=f"'{folder_id}' in parents and trashed = false",
    fields="files(id,name,size)",
    pageSize=10,
    orderBy="createdTime desc",
).execute()
files = resp.get("files", [])
target = files[file_index]
print(f"Selected: {target['name']} ({int(target.get('size', 0)) / 1_000_000:.1f} MB)")

# 2. Download it
local_path = os.path.join(DOWNLOAD_DIR, "meeting_test.mp4")
if not os.path.exists(local_path):
    print("Downloading from Drive...")
    request = drive.files().get_media(fileId=target["id"])
    with io.FileIO(local_path, "wb") as fh:
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            print(f"  {int(status.progress() * 100)}%")
else:
    print("Already downloaded, reusing local file.")

# 3. Upload to AssemblyAI
print("Uploading to AssemblyAI...")
headers = {"authorization": ASSEMBLYAI_KEY}
with open(local_path, "rb") as f:
    upload_resp = requests.post(
        "https://api.assemblyai.com/v2/upload", headers=headers, data=f
    )
audio_url = upload_resp.json()["upload_url"]

# 4. Request transcription with diarization
print("Requesting transcription (speaker_labels=True, language=uk)...")
transcript_resp = requests.post(
    "https://api.assemblyai.com/v2/transcript",
    headers=headers,
    json={
        "audio_url": audio_url,
        "speaker_labels": True,
        "language_code": "uk",
    },
)
transcript_id = transcript_resp.json()["id"]

# 5. Poll until done
poll_url = f"https://api.assemblyai.com/v2/transcript/{transcript_id}"
while True:
    result = requests.get(poll_url, headers=headers).json()
    status = result["status"]
    print(f"  status: {status}")
    if status == "completed":
        break
    if status == "error":
        print("ERROR:", result.get("error"))
        sys.exit(1)
    time.sleep(10)

# 6. Print speaker-labeled transcript
print("\n=== TRANSCRIPT (by speaker) ===\n")
speakers_seen = set()
for utt in result.get("utterances", []):
    speakers_seen.add(utt["speaker"])
    print(f"[Speaker {utt['speaker']}] {utt['text']}\n")

print(f"\n=== Speakers detected: {sorted(speakers_seen)} ===")
