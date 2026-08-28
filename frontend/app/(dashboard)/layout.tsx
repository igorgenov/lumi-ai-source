export const dynamic = "force-dynamic";

import { Sidebar } from "@/components/layout/sidebar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { ViewAsProvider } from "@/components/providers/view-as-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewAsProvider>
    <ConfirmProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className="flex-1">{children}</div>
      </main>
    </div>
    </ConfirmProvider>
    </ViewAsProvider>
  );
}
