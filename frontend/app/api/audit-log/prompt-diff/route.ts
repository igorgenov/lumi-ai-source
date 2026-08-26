import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

// Each prompt_versions row is a snapshot of the text BEFORE one specific edit — so the
// "before" for a given version is just its own `text`, and the "after" is whichever
// version was snapshotted next (or, if this was the most recent edit, the live prompt row.
export async function GET(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const versionId = req.nextUrl.searchParams.get("versionId");
  if (!versionId) return NextResponse.json({ error: "versionId is required" }, { status: 400 });

  const db = adminSupabase();

  const { data: version, error } = await db.from("prompt_versions").select("*").eq("id", versionId).single();
  if (error || !version) return NextResponse.json({ error: "Версію не знайдено" }, { status: 404 });

  const { data: nextVersion } = await db
    .from("prompt_versions")
    .select("text")
    .eq("prompt_id", version.prompt_id)
    .gt("created_at", version.created_at)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let afterText = nextVersion?.text ?? null;
  if (afterText == null) {
    const { data: livePrompt } = await db.from("prompts").select("text").eq("id", version.prompt_id).single();
    afterText = livePrompt?.text ?? "";
  }

  return NextResponse.json({ before: version.text as string, after: afterText as string });
}
