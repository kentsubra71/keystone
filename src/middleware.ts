import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const session = await auth();
  const isLoggedIn = !!session;
  const { pathname } = request.nextUrl;

  // Always allow auth and cron API routes
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login (except login page itself)
  if (!isLoggedIn && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect authenticated users away from login page
  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/today", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Only run middleware on app routes, not static assets
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/cron).*)",
  ],
};
