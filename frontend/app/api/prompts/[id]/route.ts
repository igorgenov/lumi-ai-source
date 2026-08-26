import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity-log";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

const CONTENT_FIELDS = ["name", "description", "text", "conversation_type", "manager_roles"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const allowed = [...CONTENT_FIELDS, "active"];
  const fields: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) fields[k] = body[k];
  }
  fields.updated_at = new Date().toISOString();

  const db = adminSupabase();

  // Snapshot the pre-edit state so a bad criteria change can be reverted — but only
  // for actual content edits, not a plain active/inactive toggle (which would spam
  // identical-content versions on every click).
  const isContentEdit = CONTENT_FIELDS.some(k => body[k] !== undefined);
  if (isContentEdit) {
    const { data: before } = await db.from("prompts").select("*").eq("id", params.id).single();
    if (before) {
      try {
        await db.from("prompt_versions").insert({
          prompt_id: before.id,
          name: before.name,
          description: before.description,
          text: before.text,
          conversation_type: before.conversation_type,
          manager_roles: before.manager_roles,
          edited_by: session.user?.email ?? null,
        });
      } catch (ve) {
        console.error("[prompts] failed to snapshot version (migration applied?):", ve);
      }
    }
  }

  const { data, error } = await db
    .from("prompts")
    .update(fields)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = adminSupabase();
  const { data: before } = await db.from("prompts").select("name").eq("id", params.id).single();

  const { error } = await db
    .from("prompts")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    kind: "prompt_deleted",
    summary: `Видалено промт: ${before?.name ?? params.id}`,
    href: "/prompts",
    performedBy: session.user?.email ?? null,
  });

  return NextResponse.json({ ok: true });
}
