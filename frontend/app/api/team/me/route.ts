import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/lib/auth";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

// Any authenticated user can read their own profile fields
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await adminSupabase()
    .from("managers")
    .select("position, phone, notification_settings")
    .eq("email", session.user.email)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { position: "", phone: "", notification_settings: null });
}

// Any authenticated user can update their own profile fields (position, phone, notification_settings)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = ["position", "phone", "notification_settings"]; // only these fields self-editable
  const fields: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) fields[k] = body[k];
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  const { data, error } = await adminSupabase()
    .from("managers")
    .update(fields)
    .eq("email", session.user.email)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
