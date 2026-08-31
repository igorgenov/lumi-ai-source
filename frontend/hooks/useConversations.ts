"use client";

import { useEffect, useState } from "react";

export type ConversationRow = {
  id: string;
  manager_id: string | null;
  type: string;
  status: string;
  date: string;
  created_at: string | null;
  client_name: string | null;
  client_company: string | null;
  audio_url: string | null;
  transcript: string | null;
  service: string | null;
  conversation_kind: string | null;
  contragent_id?: string | null;
  analysis_history_count?: number;
  // % of the conversation the manager spoke, computed from transcript timestamps —
  // independent of AI score/criteria. Null when unavailable (e.g. chats, old data).
  manager_talk_pct?: number | null;
  manager?: { name: string; email: string } | null;
  ai_analysis?: {
    score: number | null;
    summary: string | null;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    criteria?: Record<string, number> | null;
    manager_mood?: string | null;
    client_mood?: string | null;
  } | null;
};

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error("fetch failed");
        const { conversations: convs } = await res.json();
        setConversations((convs ?? []) as ConversationRow[]);
      } catch {
        setConversations([]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    // Auto-refresh every 60s so newly ingested calls appear without manual reload.
    // Browsers throttle setInterval in backgrounded tabs, so also refetch whenever
    // the tab regains focus/visibility — otherwise a long-open tab can silently
    // show stale data even after that timer should have fired.
    const interval = setInterval(fetchData, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") fetchData(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fetchData);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fetchData);
    };
  }, []);

  return { conversations, loading };
}
