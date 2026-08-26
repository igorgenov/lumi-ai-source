import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";
import { SCORED_KINDS } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KINDS = [
  "Статус-зустріч",
  "Планування спринту",
  "Ретроспектива",
  "Демо/Презентація",
  "Технічне обговорення",
  "Інше",
];

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { conversation_kind } = await req.json();
  if (conversation_kind !== null && !KINDS.includes(conversation_kind)) {
    return NextResponse.json({ error: "Invalid conversation_kind" }, { status: 400 });
  }

  const db = adminSupabase();
  const { error } = await db
    .from("conversations")
    .update({ conversation_kind: conversation_kind ?? null })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For PM: all conversation kinds can have scores, but null kind means no score
  if (!conversation_kind) {
    await db
      .from("ai_analysis")
      .update({ score: null, criteria: {}, criteria_explanations: {} })
      .eq("conversation_id", params.id);
  }

  return NextResponse.json({ ok: true });
}
