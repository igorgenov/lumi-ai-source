import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/lib/auth";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const role = (session.user as { role?: string })?.role;
  if (role === "owner" || role === "admin") return session;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
  if (adminEmails.includes(session.user.email)) return session;
  return null;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await adminSupabase()
    .from("managers")
    .select("id, name, email, role, position, avatar_url")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

async function logAccessChange(db: ReturnType<typeof adminSupabase>, entry: {
  action: "created" | "role_changed" | "deleted";
  target_email?: string | null; target_name?: string | null;
  before_role?: string | null; after_role?: string | null;
  performed_by?: string | null;
}) {
  try {
    await db.from("access_audit_log").insert(entry);
  } catch (e) {
    console.error("[managers] failed to log access change (migration applied?):", e);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name = "", email, role = "manager", position = "" } = body;

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const db = adminSupabase();
  const { data, error } = await db
    .from("managers")
    .insert({ name, email, role, position })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAccessChange(db, {
    action: "created", target_email: email, target_name: name,
    after_role: role, performed_by: session.user?.email ?? null,
  });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = adminSupabase();

  // Log only actual role changes — the sensitive action worth an audit trail — not
  // every minor field edit (position, etc.), to keep the log meaningful and short.
  let before: { role: string; email: string; name: string } | null = null;
  if (fields.role !== undefined) {
    const { data: existing } = await db.from("managers").select("role, email, name").eq("id", id).single();
    before = existing ?? null;
  }

  const { data, error } = await db
    .from("managers")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (before && before.role !== fields.role) {
    await logAccessChange(db, {
      action: "role_changed", target_email: before.email, target_name: before.name,
      before_role: before.role, after_role: fields.role, performed_by: session.user?.email ?? null,
    });
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = adminSupabase();
  const { data: existing } = await db.from("managers").select("email, name, role").eq("id", id).single();

  const { error } = await db
    .from("managers")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing) {
    await logAccessChange(db, {
      action: "deleted", target_email: existing.email, target_name: existing.name,
      before_role: existing.role, performed_by: session.user?.email ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}
