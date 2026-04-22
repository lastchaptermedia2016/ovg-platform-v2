import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_request: NextRequest) {
  const url = _request.nextUrl;

  // Rewrite logic for the /widget path
  // This allows the embed script to hit /widget/demo internally
  if (url.pathname.startsWith("/widget")) {
    const tenantId = url.pathname.split("/")[2];
    if (!tenantId) return NextResponse.next();

    // We can inject headers here that our Server Components can read
    const response = NextResponse.next();
    response.headers.set("x-tenant-id", tenantId);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/widget/:path*",
    "/api/chat/:path*",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
