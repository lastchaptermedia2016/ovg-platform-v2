import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAuthClient } from '@/lib/auth/server';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'widget-assets';
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

const VALID_LAYERS = new Set<string>(['header', 'footer', 'widget-body']);

const STORAGE_PATH = (tenantId: string, layer: string) => `${tenantId}/${layer}/bg`;

export async function POST(request: NextRequest) {
  try {
    // ────────────────────────────────────────────────────────────
    // STEP 1: Authenticate
    // ────────────────────────────────────────────────────────────
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createAuthClient();
    const { data: tenantId, error: tenantError } = await resolveTenantId(userId, supabase);
    if (tenantError || !tenantId) {
      console.warn('[UploadAsset] No tenant resolved for user', userId, tenantError?.message);
      return NextResponse.json(
        { success: false, error: 'No tenant associated with this account' },
        { status: 403 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 2: Parse multipart/form-data
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
    const layer = String(formData.get('layer') ?? 'widget-body').trim().toLowerCase();

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'A non-empty file is required' },
        { status: 400 }
      );
    }

    if (!VALID_LAYERS.has(layer)) {
      return NextResponse.json(
        { success: false, error: `Invalid layer. Must be one of: ${Array.from(VALID_LAYERS).join(', ')}.` },
        { status: 400 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 3: Validate MIME + size
    // ────────────────────────────────────────────────────────────
    const mime = file.type?.toLowerCase() ?? '';
    if (!mime.startsWith('image/') || !ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported file type. Only PNG, JPEG, WEBP, and GIF images are allowed.',
        },
        { status: 415 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 10 MB.' },
        { status: 413 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 4: Upload via service-role client
    // ────────────────────────────────────────────────────────────
    const path = STORAGE_PATH(tenantId, layer);
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: mime,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[UploadAsset] Storage upload failed:', uploadError.message);
      return NextResponse.json(
        { success: false, error: 'Failed to store asset' },
        { status: 500 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // STEP 5: Return deterministic public URL
    // ────────────────────────────────────────────────────────────
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ success: true, url: data.publicUrl, path, layer });
  } catch (error) {
    console.error('[UploadAsset] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
