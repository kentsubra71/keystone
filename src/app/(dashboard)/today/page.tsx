import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TodayContent } from "@/components/dashboard/TodayContent";

export default async function TodayPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-gray-200 dark:border-gray-700/40 px-8 py-6">
        <div className="max-w-5xl">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Today
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            What is due from you right now
          </p>
          <div className="h-0.5 w-12 bg-gradient-brand rounded-full mt-3" />
        </div>
      </header>

      <div className="max-w-5xl px-8 py-8">
        <TodayContent />
      </div>
    </main>
  );
}
