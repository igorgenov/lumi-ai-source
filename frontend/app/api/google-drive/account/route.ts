import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const BACKEND_URL = "https://inweb-sales-backend-871800563077.europe-west1.run.app";

export async function GET() {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const res = await fetch(`${BACKEND_URL}/api/meetings/drive-account`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: "unavailable" }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
