import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

const BACKEND_URL = "https://inweb-sales-backend-871800563077.europe-west1.run.app";

export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body?.manager_id) return NextResponse.json({ error: "manager_id required" }, { status: 400 });

  const res = await fetch(`${BACKEND_URL}/api/meetings/drive-oauth/disconnect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.MEETINGS_POLL_SECRET ? { "x-webhook-secret": process.env.MEETINGS_POLL_SECRET } : {}),
    },
    body: JSON.stringify({ manager_id: body.manager_id }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ error: data?.detail ?? "Не вдалося відключити" }, { status: res.status });
  return NextResponse.json(data);
}
