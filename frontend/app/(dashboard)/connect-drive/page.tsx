"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Video, Link2, Link2Off, Loader2 } from "lucide-react";

// Self-service Drive connection — any logged-in user (manager included) can connect
// only THEIR OWN Google Drive here, since the full /settings/integrations page (webhook
// secrets, every manager's config) is owner/admin-only and managers can't reach it at
// all. This is the link admins actually send managers.
export default function ConnectDrivePage() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [connection, setConnection] = useState<{ google_email: string | null; connected_at: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/meetings/drive-status-self")
      .then(r => { if (r.status === 404) { setNotFound(true); return null; } return r.json(); })
      .then(data => {
        if (!data) return;
        setManagerName(data.managerName ?? null);
        setConnection(data.connection ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function disconnect() {
    const ok = await confirm({
      title: "Відключити свій Google Диск?",
      description: "Lumi більше не зможе автоматично знаходити твої нові записи зустрічей, поки ти не підключишся знову.",
      danger: true,
    });
    if (!ok) return;
    setDisconnecting(true);
    await fetch("/api/meetings/drive-disconnect-self", { method: "POST" });
    setConnection(null);
    setDisconnecting(false);
  }

  return (
    <div>
      <Header title="Підключення Google Диска" subtitle="Щоб Lumi автоматично знаходила й аналізувала записи твоїх зустрічей" />
      <div className="p-6 max-w-lg">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                {managerName ?? "Твій"} Google Диск
              </p>
              <p className="text-xs text-muted-foreground">Один раз підтверди доступ — і все далі автоматично</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Завантаження…
            </div>
          ) : notFound ? (
            <p className="text-sm text-red-500">Тебе не знайдено як менеджера в Lumi — зверніться до адміністратора.</p>
          ) : connection ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-green-200 dark:border-green-500/30 dark:border-green-500/20 rounded-lg px-3 py-2.5"
                style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
                <Link2 className="w-4 h-4" /> Підключено{connection.google_email ? ` — ${connection.google_email}` : ""}
              </div>
              <button onClick={disconnect} disabled={disconnecting}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40">
                <Link2Off className="w-3.5 h-3.5" /> Відключити
              </button>
            </div>
          ) : (
            <a href="/api/meetings/drive-connect-self"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary-hover transition-colors"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}>
              Підключити Google Диск
            </a>
          )}

          <p className="text-[11px] text-muted-foreground mt-4 pt-4 border-t border-border">
            Lumi отримає лише право читати файли на твоєму Диску (без права їх змінювати чи видаляти) — і використає це тільки для того, щоб знаходити записи твоїх зустрічей Google Meet.
          </p>
        </div>
      </div>
    </div>
  );
}
