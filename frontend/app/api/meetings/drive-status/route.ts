import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET() {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const res = await fetch(`${BACKEND_URL}/api/meetings/drive-oauth/status`, {
    headers: {
      ...(process.env.MEETINGS_POLL_SECRET ? { "x-webhook-secret": process.env.MEETINGS_POLL_SECRET } : {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json({ error: data?.detail ?? "Не вдалося отримати статус" }, { status: res.status });
  return NextResponse.json(data);
}
