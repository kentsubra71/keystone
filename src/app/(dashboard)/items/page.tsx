import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AllItemsView } from "@/components/items/AllItemsView";

export default async function ItemsPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            All Items
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            View and manage all tracked items
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AllItemsView />
      </div>
    </main>
  );
}
