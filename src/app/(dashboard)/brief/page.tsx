import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DailyBriefView } from "@/components/brief/DailyBriefView";

export default async function BriefPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Daily Brief
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your morning summary - readable in under 90 seconds
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DailyBriefView />
      </div>
    </main>
  );
}
