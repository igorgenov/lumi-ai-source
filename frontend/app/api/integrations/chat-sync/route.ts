import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

// Telegram chat-analysis pipeline (Planfix) — a single company-wide toggle, unlike
// Google Drive's per-manager folder sources. since_date is intentionally NOT editable
// here: unlike one Drive folder, moving it back would re-pull correspondence across
// EVERY client at once — a much bigger blast radius, kept as a deliberate manual step
// rather than a setting someone could flip by accident.
export async function GET() {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = adminSupabase();
  const { data: cfg, error } = await db.from("chat_sync_settings").select("enabled, since_date").eq("id", 1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await db.from("conversations").select("id", { count: "exact", head: true }).eq("type", "chat");

  return NextResponse.json({ enabled: cfg?.enabled ?? false, since_date: cfg?.since_date ?? null, chatCount: count ?? 0 });
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { enabled } = await req.json();
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });

  const db = adminSupabase();
  const { error } = await db.from("chat_sync_settings").update({ enabled }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
