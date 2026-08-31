import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";
import { runAnalysisAndSave } from "@/lib/claude-analysis";

export const dynamic = "force-dynamic";

const BACKEND_URL = "https://inweb-sales-backend-871800563077.europe-west1.run.app";

function adminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}

async function fetchVttTranscript(vttUrl: string): Promise<string | null> {
  try {
    const res = await fetch(vttUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith("WEBVTT")) return null;
    return parseWebVtt(text);
  } catch {
    return null;
  }
}

function formatVttTimestamp(raw: string): string {
  const parts = raw.trim().split(":");
  const [h, m, s] = parts.length === 3 ? parts : ["0", parts[0], parts[1]];
  const total = Number(h) * 3600 + Number(m) * 60 + Math.floor(Number(s));
  const hh = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

function parseWebVtt(vtt: string): string {
  const lines: string[] = [];
  const speakerMap: Record<string, string> = {};

  for (const block of vtt.split("\n\n")) {
    const cueMatch = block.match(/([\d:.]+)\s*-->/);
    const tsPrefix = cueMatch ? `[${formatVttTimestamp(cueMatch[1])}] ` : "";

    const match = block.match(/<v\s+(?:speaker=)?(SPEAKER_\d+)>(.+?)(?:<\/v>|$)/);
    if (!match) {
      const textLines = block.split("\n").filter(l => l && !l.includes("-->") && !l.startsWith("WEBVTT"));
      if (textLines.length) lines.push(tsPrefix + textLines[textLines.length - 1]);
      continue;
    }
    const speakerId = match[1];
    const text = match[2].trim();
    if (!text) continue;
    // Neutral letter labels, NOT a manager/client guess — speaking order doesn't
    // reliably indicate the role. Claude assigns the actual role from context afterwards.
    if (!speakerMap[speakerId]) {
      speakerMap[speakerId] = String.fromCharCode(65 + Object.keys(speakerMap).length);
    }
    lines.push(`${tsPrefix}Спікер ${speakerMap[speakerId]}: ${text}`);
  }
  return lines.join("\n");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = adminSupabase();
  const { data: conv, error: convErr } = await db
    .from("conversations")
    .select("id, type, vtt_url, transcript, manager_id, status, service, conversation_kind, google_drive_file_id")
    .eq("id", params.id)
    .single();

  if (convErr || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  // Prefer re-fetching + re-parsing the raw VTT (picks up parser fixes, e.g. speaker
  // labeling), falling back to the stored transcript only if that's unavailable.
  let transcript: string | null = conv.vtt_url ? await fetchVttTranscript(conv.vtt_url) : null;
  if (!transcript) transcript = conv.transcript ?? null;
  if (!transcript) {
    // No transcript ever got saved (e.g. the original download/transcription failed
    // outright — network timeout, container restart) — re-running text analysis has
    // nothing to analyze. For a meeting recording, fall back to retrying the FULL
    // pipeline (re-download + re-transcribe + re-analyze) instead of just erroring.
    if (conv.type === "meeting" && conv.google_drive_file_id) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/meetings/retry/${params.id}`, {
          method: "POST",
          headers: process.env.MEETINGS_POLL_SECRET ? { "x-webhook-secret": process.env.MEETINGS_POLL_SECRET } : {},
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) return NextResponse.json({ error: data.detail ?? "Не вдалося запустити повторну обробку" }, { status: res.status });
        return NextResponse.json({ ok: true, retrying: true });
      } catch {
        return NextResponse.json({ error: "Не вдалося зв'язатись із сервером обробки" }, { status: 502 });
      }
    }
    return NextResponse.json({ error: "No transcript or VTT URL available" }, { status: 400 });
  }

  // Set status to analyzing
  await db.from("conversations").update({ transcript, status: "analyzing" }).eq("id", params.id);

  const result = await runAnalysisAndSave(
    db, params.id, transcript, conv.manager_id, conv.type === "meeting" ? "meeting" : "call",
    { service: conv.service, conversationKind: conv.conversation_kind }
  );

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, score: result.score });
}
