import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DueFromMeSection } from "@/components/dashboard/DueFromMeSection";
import { BlockingOthersSection } from "@/components/dashboard/BlockingOthersSection";
import { WaitingOnSection } from "@/components/dashboard/WaitingOnSection";

export default async function TodayPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Today
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                What is due from you right now
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {session.user?.email}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Due From Me (Now) */}
          <DueFromMeSection />

          {/* I Am Blocking Others */}
          <BlockingOthersSection />

          {/* Waiting On Others */}
          <WaitingOnSection />
        </div>
      </div>
    </main>
  );
}
