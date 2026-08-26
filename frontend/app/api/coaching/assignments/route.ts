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
  const { data, error } = await db.from("coaching_assignments").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: data ?? [] });
}

export async function POST(req: NextRequest) {
  // Assigning/advancing/unassigning a training program is owner/admin-only — managers
  // can view their own assignments (GET above stays manager-inclusive) but must not be
  // able to mutate them (confirmed gap 2026-08-13).
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { programId, managerId, status } = body;
  if (!programId || !managerId) return NextResponse.json({ error: "programId and managerId required" }, { status: 400 });

  const db = adminSupabase();
  const { data, error } = await db
    .from("coaching_assignments")
    .upsert({
      program_id: programId,
      manager_id: managerId,
      status: status ?? "not_started",
      assigned_at: new Date().toISOString().slice(0, 10),
    }, { onConflict: "program_id,manager_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignment: data });
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { programId, managerId, status } = await req.json();
  if (!programId || !managerId || !status) return NextResponse.json({ error: "programId, managerId, status required" }, { status: 400 });

  const db = adminSupabase();
  const { error } = await db
    .from("coaching_assignments")
    .update({ status })
    .eq("program_id", programId)
    .eq("manager_id", managerId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { programId, managerId } = await req.json();
  if (!programId || !managerId) return NextResponse.json({ error: "programId and managerId required" }, { status: 400 });

  const db = adminSupabase();
  const { error } = await db
    .from("coaching_assignments")
    .delete()
    .eq("program_id", programId)
    .eq("manager_id", managerId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
