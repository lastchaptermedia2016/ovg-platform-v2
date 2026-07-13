import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAuthClient } from '@/lib/auth/server';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'brand-logos';
const MAX_BYTES = 5 * 1024 * 1024;

// MIME gate: only raster/vector image logos are accepted. svg+xml is allowed
// because logos are frequently distributed as SVG.
const ALLOWED_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

// Tenant logos land at a deterministic path so re-uploads cleanly overwrite and
// the public URL stays stable across saves.
const STORAGE_PATH = (tenantId: string) => `${tenantId}/logo`;

export async function POST(request: NextRequest) {
  try {
    // ────────────────────────────────────────────────────────────
    // STEP 1: Authenticate the calling session
    // ────────────────────────────────────────────────────────────
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ────────────────────────────────────────────────────────────
    // STEP 2: Resolve the active tenant (scopes + names the object)
    // ────────────────────────────────────────────────────────────
    // Use the authenticated server client so RLS policies keyed on
    // `auth.uid()` resolve. The default browser client has no session here and
    // would return a null tenant (-> 403 "No tenant associated...").
    const supabase = await createAuthClient();
    const { data: tenantId, error: tenantError } = await resolveTenantId(userId, supabase);
    if (tenantError || !tenantId) {
      console.warn('[UploadLogo] No tenant resolved for user', userId, tenantError?.message);
      return NextResponse.json(
        { success: false, error: 'No tenant associated with this account' },
        { status: 403 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 3: Parse multipart/form-data
    // ────────────────────────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid multipart/form-data payload' },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'A non-empty file is required' },
        { status: 400 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 4: Validate signature (MIME gate + size limit)
    // ────────────────────────────────────────────────────────────
    const mime = file.type?.toLowerCase() ?? '';
    if (!mime.startsWith('image/') || !ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported file type. Only PNG, JPEG, WEBP, GIF, or SVG images are allowed.',
        },
        { status: 415 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 5 MB.' },
        { status: 413 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 5: Upload via service-role client (never exposed to client)
    // ────────────────────────────────────────────────────────────
    const path = STORAGE_PATH(tenantId);
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: mime,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[UploadLogo] Storage upload failed:', uploadError.message);
      return NextResponse.json(
        { success: false, error: 'Failed to store logo asset' },
        { status: 500 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 6: Return the deterministic public URL
    // ────────────────────────────────────────────────────────────
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ success: true, url: data.publicUrl, path });
  } catch (error) {
    console.error('[UploadLogo] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────
// Unsupported methods
// ──────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
