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
  const { data, error } = await db.from("coaching_plans").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: data ?? [] });
}

export async function POST(req: NextRequest) {
  // Writing/deleting a manager's own coaching plan is owner/admin-only — a manager can
  // read their own plan (GET above stays manager-inclusive) but must not be able to
  // set their own targets or delete the plan entirely (confirmed gap 2026-08-13).
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { managerId, goal, targetGreenPct, targetYellowPct, targetRedPct, deadline, notes } = body;
  if (!managerId) return NextResponse.json({ error: "managerId required" }, { status: 400 });

  const green = Number(targetGreenPct ?? 20);
  const yellow = Number(targetYellowPct ?? 65);
  const red = Number(targetRedPct ?? 15);
  if ([green, yellow, red].some(n => !Number.isFinite(n) || n < 0 || n > 100)) {
    return NextResponse.json({ error: "Кожна ціль по зоні має бути числом від 0 до 100" }, { status: 400 });
  }
  if (green + yellow + red !== 100) {
    return NextResponse.json({ error: `Сума цілей по зонах має дорівнювати 100% (зараз ${green + yellow + red}%)` }, { status: 400 });
  }

  const db = adminSupabase();
  const { data, error } = await db
    .from("coaching_plans")
    .upsert({
      manager_id: managerId,
      goal: goal ?? "",
      target_green_pct: green,
      target_yellow_pct: yellow,
      target_red_pct: red,
      deadline: deadline || null,
      notes: notes ?? "",
      updated_at: new Date().toISOString(),
    }, { onConflict: "manager_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data });
}

export async function DELETE(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { managerId } = await req.json();
  if (!managerId) return NextResponse.json({ error: "managerId required" }, { status: 400 });

  const db = adminSupabase();
  const { error } = await db.from("coaching_plans").delete().eq("manager_id", managerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
