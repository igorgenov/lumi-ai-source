import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await adminSupabase()
    .from("prompt_versions")
    .select("*")
    .eq("prompt_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Restores a past version onto the live prompt — snapshots the CURRENT state first
// (under the same prompt_id) so restoring is itself just another revertible edit.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { versionId } = await req.json();
  if (!versionId) return NextResponse.json({ error: "versionId is required" }, { status: 400 });

  const db = adminSupabase();

  const { data: version, error: vErr } = await db
    .from("prompt_versions")
    .select("*")
    .eq("id", versionId)
    .eq("prompt_id", params.id)
    .single();
  if (vErr || !version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const { data: current } = await db.from("prompts").select("*").eq("id", params.id).single();
  if (current) {
    await db.from("prompt_versions").insert({
      prompt_id: current.id,
      name: current.name,
      description: current.description,
      text: current.text,
      conversation_type: current.conversation_type,
      manager_roles: current.manager_roles,
      edited_by: session.user?.email ?? null,
    });
  }

  const { data, error } = await db
    .from("prompts")
    .update({
      name: version.name,
      description: version.description,
      text: version.text,
      conversation_type: version.conversation_type,
      manager_roles: version.manager_roles,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
