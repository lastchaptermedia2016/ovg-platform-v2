import { NextRequest, NextResponse } from "next/server";
import { getRouteContext } from "@/lib/url-resolver";

/**
 * GET /api/branding?type=reseller|client&slug=[slug]
 * Returns branding data based on URL context
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as
    | "reseller"
    | "client"
    | "master"
    | null;
  const slug = searchParams.get("slug");

  if (!type || !slug) {
    return NextResponse.json(
      {
        branding: {
          name: "Voice Platform",
          logoUrl: "/logo-default.svg",
          primaryColor: "#0097b2",
          accentColor: "#D4AF37",
        },
      },
      { status: 200 }
    );
  }

  try {
    // Build pathname from type and slug for the resolver
    const pathname = type === "master" ? "/dashboard" : `/${type}/${slug}`;
    const context = await getRouteContext(pathname);

    return NextResponse.json(
      {
        branding: context.branding,
        entityType: context.entityType,
        slug: context.slug,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Branding API error:", error);
    return NextResponse.json(
      {
        error: "Failed to resolve branding",
        branding: {
          name: "Voice Platform",
          logoUrl: "/logo-default.svg",
          primaryColor: "#0097b2",
          accentColor: "#D4AF37",
        },
      },
      { status: 500 }
    );
  }
}
