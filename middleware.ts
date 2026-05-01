import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "./src/lib/supabase/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Centralized Identity Gate: Protect /reseller/* routes
  if (pathname.startsWith("/reseller/")) {
    try {
      // Check for authenticated session
      const supabase = await createClient();
      const { data: { session }, error } = await supabase.auth.getSession();

      // If no session, redirect to unified auth page
      if (!session || error) {
        const authUrl = new URL('/auth', request.url);
        authUrl.searchParams.set('redirectTo', pathname);
        return NextResponse.redirect(authUrl);
      }

      // Session exists, continue with tenant ID injection
      const response = NextResponse.next();
      response.headers.set("x-user-id", session.user.id);
      return response;
    } catch (err) {
      // If session check fails, redirect to unified auth page
      const authUrl = new URL('/auth', request.url);
      authUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(authUrl);
    }
  }

  // 2. Surgical Strike: Only process paths starting with /widget
  if (pathname.startsWith("/widget/")) {
    const parts = pathname.split("/");
    const tenantId = parts[2];

    // If no tenantId is found, just continue without crashing
    if (!tenantId) return NextResponse.next();

    const response = NextResponse.next();
    
    // 3. Inject the Tenant ID into headers for Server Components
    // This allows your database queries to know "who" is calling
    response.headers.set("x-tenant-id", tenantId);
    return response;
  }

  // 4. Fallback: For all other matched routes, just pass through
  return NextResponse.next();
}

// 5. Strict Scoping: Middleware ONLY runs on these paths
// This prevents 500 errors on the home page or static assets
export const config = {
  matcher: [
    "/reseller/:path*",
    "/widget/:path*",
    "/api/chat/:path*",
  ],
};