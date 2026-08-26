import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Ringostat's own AI already transcribes calls into a WebVTT file — when its webhook
// to us fails, or for a call outside our system entirely, an admin can paste that VTT
// link directly and we parse it the same way the automated webhook does (see
// backend/app/services/ringostat.py::parse_webvtt, mirrored here since this only needs
// a plain URL fetch + text parsing, no Google auth or other backend-only capability).
function formatVttTimestamp(raw: string): string {
  const parts = raw.trim().split(":");
  const [h, m, s] = parts.length === 3 ? parts : ["0", parts[0], parts[parts.length - 1]];
  const total = Math.floor(Number(h) * 3600 + Number(m) * 60 + Number(s));
  const hh = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

function parseWebVtt(vtt: string): string {
  const speakerMap: Record<string, string> = {};
  const lines: string[] = [];
  for (const block of vtt.split("\n\n")) {
    const cue = /([\d:.]+)\s*-->/.exec(block);
    const tsPrefix = cue ? `[${formatVttTimestamp(cue[1])}] ` : "";
    const match = /<v\s+speaker=(SPEAKER_\d+)>(.+?)(?:<\/v>|$)|<v\s+(SPEAKER_\d+)>(.+?)(?:<\/v>|$)/.exec(block);
    if (!match) {
      const textLines = block.split("\n").filter(l => l && !l.includes("-->") && !l.startsWith("WEBVTT"));
      if (textLines.length) lines.push(tsPrefix + textLines[textLines.length - 1]);
      continue;
    }
    const speakerId = match[1] ?? match[3];
    const text = (match[2] ?? match[4] ?? "").trim();
    if (!text) continue;
    if (!(speakerId in speakerMap)) {
      speakerMap[speakerId] = String.fromCharCode(65 + Object.keys(speakerMap).length);
    }
    lines.push(`${tsPrefix}Спікер ${speakerMap[speakerId]}: ${text}`);
  }
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["owner", "admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { url } = await req.json();
  if (!url?.trim()) return NextResponse.json({ error: "url is required" }, { status: 400 });

  try {
    const res = await fetch(url.trim(), { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `Не вдалося завантажити файл (HTTP ${res.status})` }, { status: 502 });
    const content = await res.text();
    if (!content.trim().startsWith("WEBVTT")) {
      return NextResponse.json({ error: "Це не VTT-файл — перевір посилання (має вести на .vtt, а не на аудіо)" }, { status: 400 });
    }
    const transcript = parseWebVtt(content);
    if (!transcript.trim()) {
      return NextResponse.json({ error: "VTT-файл порожній або текст не вдалось розпізнати" }, { status: 422 });
    }
    return NextResponse.json({ transcript });
  } catch {
    return NextResponse.json({ error: "Мережева помилка при завантаженні VTT" }, { status: 502 });
  }
}
