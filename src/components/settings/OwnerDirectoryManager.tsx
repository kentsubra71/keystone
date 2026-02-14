"use client";

import { useState, useEffect } from "react";

type Owner = {
  id: string;
  displayName: string;
  email: string;
};

export function OwnerDirectoryManager() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOwners();
  }, []);

  async function fetchOwners() {
    try {
      const res = await fetch("/api/owner-directory");
      if (res.ok) {
        const data = await res.json();
        setOwners(data.owners || []);
      }
    } catch (err) {
      console.error("Failed to fetch owners:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddOwner(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newDisplayName.trim() || !newEmail.trim()) {
      setError("Both display name and email are required");
      return;
    }

    try {
      const res = await fetch("/api/owner-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: newDisplayName.trim(),
          email: newEmail.trim(),
        }),
      });

      if (res.ok) {
        setNewDisplayName("");
        setNewEmail("");
        fetchOwners();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add owner");
      }
    } catch (err) {
      setError("Failed to add owner");
    }
  }

  async function handleDeleteOwner(id: string) {
    try {
      const res = await fetch(`/api/owner-directory/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchOwners();
      }
    } catch (err) {
      console.error("Failed to delete owner:", err);
    }
  }

  if (isLoading) {
    return (
      <div className="text-gray-600 dark:text-gray-300">Loading...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add new owner form */}
      <form onSubmit={handleAddOwner} className="flex gap-3">
        <input
          type="text"
          placeholder="Display name (e.g., Ravi)"
          value={newDisplayName}
          onChange={(e) => setNewDisplayName(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700/40 rounded-lg bg-surface-card text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
        />
        <input
          type="email"
          placeholder="Email (e.g., ravi@example.com)"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700/40 rounded-lg bg-surface-card text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
        />
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-brand text-white hover:opacity-90 transition-all"
        >
          Add
        </button>
      </form>

      {error && (
        <p className="text-sm text-rose-400">{error}</p>
      )}

      {/* Owner list */}
      {owners.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-300 text-sm">
          No owner mappings defined yet.
        </p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700/40">
              <th className="pb-2 font-medium">Display Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium w-20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700/30">
            {owners.map((owner) => (
              <tr key={owner.id}>
                <td className="py-3 text-gray-900 dark:text-white">
                  {owner.displayName}
                </td>
                <td className="py-3 text-gray-600 dark:text-gray-400">
                  {owner.email}
                </td>
                <td className="py-3">
                  <button
                    onClick={() => handleDeleteOwner(owner.id)}
                    className="text-rose-800 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-200 text-sm transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
