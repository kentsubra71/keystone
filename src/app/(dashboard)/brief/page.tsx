import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DailyBriefView } from "@/components/brief/DailyBriefView";

export default async function BriefPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-gray-200 dark:border-gray-700/40 px-8 py-6">
        <div className="max-w-4xl">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Daily Brief
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Your morning summary — readable in under 90 seconds
          </p>
          <div className="h-0.5 w-12 bg-gradient-brand rounded-full mt-3" />
        </div>
      </header>

      <div className="max-w-4xl px-8 py-8">
        <DailyBriefView />
      </div>
    </main>
  );
}
