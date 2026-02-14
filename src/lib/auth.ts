import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

const isMockAuth = process.env.MOCK_AUTH === "true";

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
            // In mock mode, accept any email
            const email =
              (credentials?.email as string) ||
              process.env.ALLOWED_USER_EMAIL ||
              "dev@localhost";
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
                "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
            },
          },
        }),
      ],
  callbacks: {
    async signIn({ user }) {
      // Single user restriction
      const allowedEmail = process.env.ALLOWED_USER_EMAIL;
      if (allowedEmail && user.email !== allowedEmail) {
        return false;
      }
      return true;
    },
    async jwt({ token, account }) {
      // Persist the OAuth access_token and refresh_token to the token
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      // Add access token to session for API calls
      session.accessToken = token.accessToken as string;
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
  }
}
