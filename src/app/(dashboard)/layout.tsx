import { Sidebar } from "@/components/layout/Sidebar";
import { NudgeBanner } from "@/components/nudges/NudgeBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <NudgeBanner />
      <Sidebar />
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
