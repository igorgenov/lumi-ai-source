"use client";

import { notFound } from "next/navigation";
import { useParams } from "next/navigation";
import { ProfileTab, IntegrationsTab, ManagersTab, NotificationsTab, ReportsTab, ChangelogTab, CostsTab, AuditLogTab } from "../_components";

const TAB_MAP: Record<string, React.ComponentType> = {
  profile:       ProfileTab,
  integrations:  IntegrationsTab,
  access:        ManagersTab,
  notifications: NotificationsTab,
  reports:       ReportsTab,
  costs:         CostsTab,
  "audit-log":   AuditLogTab,
  changelog:     ChangelogTab,
};

export default function SettingsTabPage() {
  const { tab } = useParams<{ tab: string }>();
  const Component = TAB_MAP[tab];
  if (!Component) notFound();
  return <Component />;
}
