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
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Settings
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Admin configuration
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Owner Directory */}
          <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Owner Directory
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Map display names from the sheet to email addresses for accurate
              ownership tracking.
            </p>
            <OwnerDirectoryManager />
          </section>

          {/* Sync Settings */}
          <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Sync Settings
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Configure how and when data is synced from Google Sheets.
            </p>
            <SyncSettings />
          </section>
        </div>
      </div>
    </main>
  );
}
