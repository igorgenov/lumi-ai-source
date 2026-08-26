import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

export async function GET() {
  // Managers may view prompts (to see what criteria score their calls) but not edit them.
  const session = await requireRole(["owner", "admin", "manager"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await adminSupabase()
    .from("prompts")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, text, active, conversation_type, manager_roles } = body;
  if (!name?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "name and text are required" }, { status: 400 });
  }

  const { data, error } = await adminSupabase()
    .from("prompts")
    .insert({
      name: name.trim(),
      description: description?.trim() ?? "",
      text: text.trim(),
      active: active ?? true,
      conversation_type: conversation_type ?? "all",
      manager_roles: manager_roles ?? [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
