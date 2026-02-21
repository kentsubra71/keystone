import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

const isMockAuth = process.env.MOCK_AUTH === "true";

async function refreshAccessToken(token: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
      }),
    });

    const refreshed = await response.json();

    if (!response.ok) {
      throw new Error(refreshed.error || "Token refresh failed");
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      // Google returns expires_in (seconds), convert to absolute timestamp
      expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      // Google may or may not return a new refresh token
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error("Failed to refresh access token:", error);
    return { ...token, error: "RefreshTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: isMockAuth
    ? [
        // Mock provider for local development
        Credentials({
          name: "Mock Auth",
          credentials: {
            email: { label: "Email", type: "email" },
          },
          async authorize(credentials) {
            const email =
              (credentials?.email as string) ||
              process.env.ALLOWED_USER_EMAIL ||
              "dev@localhost";

            // Enforce allowlist even in mock mode
            const allowed = process.env.ALLOWED_USER_EMAIL;
            if (allowed && email.toLowerCase() !== allowed.toLowerCase()) {
              return null;
            }

            return {
              id: "mock-user-id",
              email,
              name: "Dev User",
              image: null,
            };
          },
        }),
      ]
    : [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          authorization: {
            params: {
              prompt: "consent",
              access_type: "offline",
              response_type: "code",
              scope:
                "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
            },
          },
        }),
      ],
  callbacks: {
    async signIn({ user }) {
      // Single user restriction (case-insensitive)
      const allowedEmail = process.env.ALLOWED_USER_EMAIL;
      if (allowedEmail && user.email?.toLowerCase() !== allowedEmail.toLowerCase()) {
        return false;
      }
      return true;
    },
    async jwt({ token, account }) {
      // On initial sign-in, persist OAuth tokens
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;

        // Store tokens in DB for cron access
        if (account.refresh_token && token.email) {
          try {
            const { db } = await import("@/lib/db");
            const { appSettings } = await import("@/lib/db/schema");
            const { eq } = await import("drizzle-orm");

            await db
              .insert(appSettings)
              .values({
                key: "oauth_tokens",
                value: {
                  refreshToken: account.refresh_token,
                  accessToken: account.access_token,
                  expiresAt: account.expires_at,
                  userEmail: token.email,
                },
              })
              .onConflictDoUpdate({
                target: appSettings.key,
                set: {
                  value: {
                    refreshToken: account.refresh_token,
                    accessToken: account.access_token,
                    expiresAt: account.expires_at,
                    userEmail: token.email,
                  },
                  updatedAt: new Date(),
                },
              });
          } catch (err) {
            console.error("Failed to store OAuth tokens for cron:", err);
          }
        }

        return token;
      }

      // If token hasn't expired, return it as-is
      if (typeof token.expiresAt === "number" && Date.now() < token.expiresAt * 1000) {
        return token;
      }

      // Token has expired — refresh it
      if (token.refreshToken) {
        return refreshAccessToken(token);
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      if (token.error) {
        session.error = token.error as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});

// Extend the session type
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
  }
}
