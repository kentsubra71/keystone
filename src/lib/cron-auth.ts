import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type StoredTokens = {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  userEmail: string;
};

export async function refreshStoredToken(): Promise<{
  accessToken: string;
  userEmail: string;
}> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "oauth_tokens"));

  if (!row) {
    throw new Error("No stored OAuth tokens. User must sign in first.");
  }

  const tokens = row.value as StoredTokens;

  // Return if token still valid (5-minute buffer)
  if (tokens.expiresAt > Math.floor(Date.now() / 1000) + 300) {
    return { accessToken: tokens.accessToken, userEmail: tokens.userEmail };
  }

  // Refresh the token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }),
  });

  const refreshed = await response.json();
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${refreshed.error}`);
  }

  const updatedTokens: StoredTokens = {
    refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
    accessToken: refreshed.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
    userEmail: tokens.userEmail,
  };

  await db
    .update(appSettings)
    .set({ value: updatedTokens, updatedAt: new Date() })
    .where(eq(appSettings.key, "oauth_tokens"));

  return {
    accessToken: updatedTokens.accessToken,
    userEmail: updatedTokens.userEmail,
  };
}
