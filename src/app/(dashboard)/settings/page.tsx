import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OwnerDirectoryManager } from "@/components/settings/OwnerDirectoryManager";
import { SyncSettings } from "@/components/settings/SyncSettings";

export default async function SettingsPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-gray-200 dark:border-gray-700/40 px-8 py-6">
        <div className="max-w-5xl">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Settings
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Admin configuration
          </p>
          <div className="h-0.5 w-12 bg-gradient-brand rounded-full mt-3" />
        </div>
      </header>

      <div className="max-w-5xl px-8 py-8">
        <div className="space-y-8">
          {/* Owner Directory */}
          <section className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Owner Directory
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Map display names from the sheet to email addresses for accurate
              ownership tracking.
            </p>
            <OwnerDirectoryManager />
          </section>

          {/* Sync Settings */}
          <section className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Sync Settings
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Configure how and when data is synced from Google Sheets.
            </p>
            <SyncSettings />
          </section>
        </div>
      </div>
    </main>
  );
}
