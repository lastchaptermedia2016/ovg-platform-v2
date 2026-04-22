import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Surgical Strike: Only process paths starting with /widget
  if (pathname.startsWith("/widget/")) {
    const parts = pathname.split("/");
    const tenantId = parts[2];

    // If no tenantId is found, just continue without crashing
    if (!tenantId) return NextResponse.next();

    const response = NextResponse.next();
    
    // 2. Inject the Tenant ID into headers for Server Components
    // This allows your database queries to know "who" is calling
    response.headers.set("x-tenant-id", tenantId);
    return response;
  }

  // 3. Fallback: For all other matched routes, just pass through
  return NextResponse.next();
}

// 4. Strict Scoping: Middleware ONLY runs on these paths
// This prevents 500 errors on the home page or static assets
export const config = {
  matcher: [
    "/widget/:path*",
    "/api/chat/:path*",
  ],
};