import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export async function GET() {
  const session = await requireRole(["owner", "admin", "manager"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = adminSupabase();
  const { data, error } = await db
    .from("coaching_sessions")
    .select("*, manager:managers(id, name)")
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: NextRequest) {
  // Creating/editing/deleting a PDP session (notes, homework, status) is owner/admin-
  // only — managers can view their own sessions (GET above stays manager-inclusive) but
  // must not be able to write to them, including via the "Додати в коучинг" button on
  // a conversation page (confirmed gap 2026-08-13).
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { managerId, date, notes, homework, nextSession, status } = body;

  if (!managerId || !date) {
    return NextResponse.json({ error: "managerId and date are required" }, { status: 400 });
  }

  const db = adminSupabase();

  // A manager only has one PDP meeting per day in practice — merge into that day's
  // session instead of creating a duplicate (e.g. two calls analyzed same day).
  const { data: existing } = await db
    .from("coaching_sessions")
    .select("*")
    .eq("manager_id", managerId)
    .eq("date", date)
    .maybeSingle();

  if (existing) {
    const mergedNotes = notes && notes !== existing.notes
      ? `${existing.notes}\n\n${notes}`.trim()
      : existing.notes;

    const { data, error } = await db
      .from("coaching_sessions")
      .update({
        notes: mergedNotes,
        homework: homework || existing.homework,
        next_session: nextSession || existing.next_session,
      })
      .eq("id", existing.id)
      .select("*, manager:managers(id, name)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ session: data });
  }

  const { data, error } = await db
    .from("coaching_sessions")
    .insert({
      manager_id: managerId,
      date,
      notes: notes ?? "",
      homework: homework ?? "",
      next_session: nextSession || null,
      status: status ?? "planned",
    })
    .select("*, manager:managers(id, name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, notes, homework, nextSession, status } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (notes !== undefined) update.notes = notes;
  if (homework !== undefined) update.homework = homework;
  if (nextSession !== undefined) update.next_session = nextSession || null;
  if (status !== undefined) update.status = status;

  const db = adminSupabase();
  const { data, error } = await db
    .from("coaching_sessions")
    .update(update)
    .eq("id", id)
    .select("*, manager:managers(id, name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

export async function DELETE(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = adminSupabase();
  const { error } = await db.from("coaching_sessions").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
