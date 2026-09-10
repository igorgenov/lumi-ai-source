import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Redirects the browser straight into Google's OAuth consent screen for one manager's
// Drive — the backend builds the signed state + authorize URL (google_drive_oauth.py),
// this route is just the owner/admin gate plus the redirect hop.
export async function GET(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const managerId = req.nextUrl.searchParams.get("manager_id");
  if (!managerId) return NextResponse.json({ error: "manager_id required" }, { status: 400 });

  const res = await fetch(`${BACKEND_URL}/api/meetings/drive-oauth/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.MEETINGS_POLL_SECRET ? { "x-webhook-secret": process.env.MEETINGS_POLL_SECRET } : {}),
    },
    body: JSON.stringify({ manager_id: managerId }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) {
    return NextResponse.json({ error: data?.detail ?? "Не вдалося почати авторизацію" }, { status: res.status || 500 });
  }

  return NextResponse.redirect(data.url);
}
