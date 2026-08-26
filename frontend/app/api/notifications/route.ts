import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/lib/auth";
import { stripAgencyPrefix } from "@/lib/utils";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

// Conversations can get stuck in "analyzing" (webhook/analysis step crashed without
// ever setting status to "failed"/"analyzed"). There's no cron for this — instead we
// check on every notifications poll and create one "stuck" notification per affected
// conversation, guarded by an existence check so repeated polls don't spam duplicates.
async function flagStaleAnalyses(db: ReturnType<typeof adminSupabase>) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: stale } = await db
    .from("conversations")
    .select("id, client_name, created_at")
    .eq("status", "analyzing")
    .lt("created_at", oneHourAgo);

  for (const c of stale ?? []) {
    const href = `/conversations/${c.id}`;
    const { data: existing } = await db
      .from("notifications")
      .select("id")
      .eq("type", "stuck")
      .eq("href", href)
      .limit(1);
    if (existing?.length) continue;

    await db.from("notifications").insert({
      type: "stuck",
      title: "Очікує аналізу > 1 години",
      body: `${stripAgencyPrefix(c.client_name) || "Розмова"} — аналіз досі не завершено`,
      href,
      read: false,
    });
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminSupabase();
  await flagStaleAnalyses(db);

  const { data, error } = await db
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [] });
}

// PATCH /api/notifications — mark as read
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, markAllRead } = await req.json();
  const db = adminSupabase();

  if (markAllRead) {
    await db.from("notifications").update({ read: true }).eq("read", false);
  } else if (id) {
    await db.from("notifications").update({ read: true }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/notifications — dismiss one or all
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, clearAll } = await req.json();
  const db = adminSupabase();

  if (clearAll) {
    await db.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  } else if (id) {
    await db.from("notifications").delete().eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
