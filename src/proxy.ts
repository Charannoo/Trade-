/**
 * proxy.ts — Auth gate for Next.js 16 (renamed from middleware).
 * Auth is entirely bypassed unless AUTH_ENABLED=true.
 */

export default function proxy(request: any) {
  // Auth OFF by default
  if (process.env.AUTH_ENABLED !== "true") {
    return; // No response = pass through
  }

  // When auth is enabled, allow public routes
  const { pathname } = new URL(request.url);
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/")
  ) {
    return; // Pass through for auth routes
  }

  // TODO: Check session cookie for authenticated routes
  // For now, pass through (auth not fully implemented yet)
  return;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
