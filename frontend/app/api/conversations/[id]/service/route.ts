import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const SERVICES = ["SEO", "GEO", "PPC", "Analytics", "ASO", "ASA", "Nonprofit", "Не цільова"];

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // owner/admin only — NOT manager. "Не цільова" here excludes a conversation from AI
  // score the same way conversation_kind does (see kind/route.ts) — same conflict of
  // interest if the manager on the call can self-edit it, and no per-conversation
  // ownership check exists to even limit it to their own calls.
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { service } = await req.json();
  if (service !== null) {
    const parts = String(service).split(",").map((s: string) => s.trim()).filter(Boolean);
    if (parts.length === 0 || parts.some((p: string) => !SERVICES.includes(p))) {
      return NextResponse.json({ error: "Invalid service" }, { status: 400 });
    }
  }

  const db = adminSupabase();
  const { error } = await db
    .from("conversations")
    .update({ service: service ?? null })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
