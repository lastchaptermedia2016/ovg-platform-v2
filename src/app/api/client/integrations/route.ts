import { NextResponse } from 'next/server';
import { getAuthenticatedUser, createAuthClient } from '@/lib/auth/server';
import {
  getIntegrationsForUser,
  saveIntegrationForUser,
} from '@/lib/ai/integration-service';
import { ClientIntegrationConfigSchema } from '@/lib/schemas/client-config.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/client/integrations
 *
 * Returns the active client's saved integrations, pre-sanitized so sensitive
 * credentials are replaced with an `isConfigured` boolean. Powers form
 * pre-fill on the Studio → Integrations page.
 */
export async function GET() {
  const { userId, error: authError } = await getAuthenticatedUser();
  if (authError || !userId) {
    return NextResponse.json({ error: authError ?? 'Unauthorized', integrations: {} }, { status: 401 });
  }

  try {
    const { integrations } = await getIntegrationsForUser(userId, createAuthClient());
    return NextResponse.json({ integrations });
  } catch (err) {
    console.error('[client/integrations] GET failed:', err);
    return NextResponse.json({ integrations: {} }, { status: 500 });
  }
}

const SaveSchema = ClientIntegrationConfigSchema;

/**
 * POST /api/client/integrations
 *
 * Body: { integrationId: string, config: ClientIntegrationConfig }
 *
 * Authenticates the session, validates the payload, encrypts sensitive fields,
 * and merges the result into the tenant's widget_config.integrations blob.
 */
export async function POST(request: Request) {
  const { userId, error: authError } = await getAuthenticatedUser();
  if (authError || !userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsedBody = body as { integrationId?: unknown; config?: unknown };
  const integrationId = parsedBody?.integrationId;
  if (typeof integrationId !== 'string' || integrationId.length === 0) {
    return NextResponse.json({ success: false, error: 'Missing integrationId' }, { status: 400 });
  }

  const configValidation = SaveSchema.safeParse(parsedBody?.config ?? {});
  if (!configValidation.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid configuration', details: configValidation.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await saveIntegrationForUser(userId, integrationId, configValidation.data);
    return NextResponse.json({ success: true, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[client/integrations] POST failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
