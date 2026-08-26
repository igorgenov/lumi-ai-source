import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Surfaces the real shared secret the backend checks against the Ringostat webhook's
// x-webhook-secret header (app/routers/webhooks.py) — Settings previously showed an
// unrelated hardcoded placeholder here instead of the value actually enforced.
export async function GET() {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ secret: process.env.RINGOSTAT_WEBHOOK_SECRET ?? null });
}
