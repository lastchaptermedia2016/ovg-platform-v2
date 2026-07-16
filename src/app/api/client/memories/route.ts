/**
 * @file route.ts
 *
 * ZEEDER Client Relational-Memory Read API
 *
 * Surface-isolated endpoint that returns the active client's relational memory
 * (client_name / company_name / preferences) for the UI to render a subtle
 * "Recognized User" indicator. This mirrors the read performed inside
 * /api/client/process-command but is exposed read-only for the widget header.
 *
 * This module is intentionally **zero-dependency** with respect to the
 * reseller domain. It resolves the tenant via the authenticated user session
 * and reads from `client_memories` through the service client, exactly like
 * the upstream process-command route.
 */

import { NextResponse } from "next/server";
import { getAuthenticatedUser, createAuthClient } from "@/lib/auth/server";
import { resolveTenantId } from "@/lib/resolveTenantId";
import { getClientMemories } from "@/lib/ai/memory-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/client/memories
 *
 * @returns A flat map of memory_key → memory_value for the active client, plus
 *   a boolean `hasMemory` flag the UI can branch on.
 */
export async function GET() {
  const { userId, error: authError } = await getAuthenticatedUser();
  if (authError || !userId) {
    return NextResponse.json(
      { error: authError ?? "Unauthorized", memories: {}, hasMemory: false },
      { status: 401 },
    );
  }

  try {
    const supabase = await createAuthClient();
    const { data: tenantId, error: tenantError } = await resolveTenantId(userId, supabase);
    if (tenantError || !tenantId) {
      return NextResponse.json({ memories: {}, hasMemory: false });
    }

    const memories = await getClientMemories(tenantId, userId);
    const hasMemory = Object.keys(memories).length > 0;

    return NextResponse.json({ memories, hasMemory });
  } catch (err) {
    console.error("[client/memories] failed:", err);
    return NextResponse.json({ memories: {}, hasMemory: false });
  }
}
