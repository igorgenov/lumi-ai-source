import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";
import { runAnalysisAndSave } from "@/lib/claude-analysis";

export const dynamic = "force-dynamic";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

const DOMAIN_RE = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/i;

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}
function normalizeDomain(raw: string): string | null {
  const candidate = raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return DOMAIN_RE.test(candidate) ? candidate : null;
}

// Best-effort — mirrors backend/app/services/contragents.py's matching (phone, then
// domain, then a name-only stub), since this manual-entry path never went through
// that pipeline at all — a manually-added call/meeting used to just sit with no
// contragent forever, even when its client_name was literally a phone number that
// already matched an existing contragent (confirmed 2026-07-28).
async function findOrCreateContragent(db: ReturnType<typeof adminSupabase>, clientName: string): Promise<string | null> {
  try {
    const phone = normalizePhone(clientName);
    if (phone) {
      const { data } = await db.from("contragents").select("id, is_archived").eq("phone", phone).limit(1);
      if (data?.[0]) {
        if (data[0].is_archived) await db.from("contragents").update({ is_archived: false }).eq("id", data[0].id);
        return data[0].id;
      }
      const created = await db.from("contragents").insert({ phone, name: clientName.trim() }).select("id").single();
      return created.data?.id ?? null;
    }
    const domain = normalizeDomain(clientName);
    if (domain) {
      const { data } = await db.from("contragents").select("id, is_archived").eq("domain", domain).limit(1);
      if (data?.[0]) {
        if (data[0].is_archived) await db.from("contragents").update({ is_archived: false }).eq("id", data[0].id);
        return data[0].id;
      }
      const created = await db.from("contragents").insert({ domain, name: clientName.trim() }).select("id").single();
      return created.data?.id ?? null;
    }
    const created = await db.from("contragents").insert({ name: clientName.trim() }).select("id").single();
    return created.data?.id ?? null;
  } catch (e) {
    console.error("[manual] contragent matching failed (best-effort, ignoring):", e);
    return null;
  }
}

// Manually adds a conversation for AI analysis outside the automated pipelines —
// to test a prompt change against a known transcript. No audio/video recording,
// just a transcript.
export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { type, manager_id, client_name, date, transcript } = body;

  if (!["call", "meeting"].includes(type)) {
    return NextResponse.json({ error: "type must be 'call' or 'meeting'" }, { status: 400 });
  }
  if (!transcript?.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }
  if (!client_name?.trim()) {
    return NextResponse.json({ error: "client_name is required" }, { status: 400 });
  }

  const db = adminSupabase();
  const contragentId = await findOrCreateContragent(db, client_name.trim());

  const { data: conv, error: insertErr } = await db
    .from("conversations")
    .insert({
      type,
      manager_id: manager_id || null,
      client_name: client_name.trim(),
      date: date || new Date().toISOString(),
      transcript: transcript.trim(),
      status: "analyzing",
      contragent_id: contragentId,
    })
    .select("id")
    .single();

  if (insertErr || !conv) {
    return NextResponse.json({ error: insertErr?.message ?? "Failed to create conversation" }, { status: 500 });
  }

  const result = await runAnalysisAndSave(db, conv.id, transcript.trim(), manager_id || null, type);

  if (result.error) return NextResponse.json({ error: result.error, conversationId: conv.id }, { status: 500 });
  return NextResponse.json({ ok: true, conversationId: conv.id, score: result.score });
}
