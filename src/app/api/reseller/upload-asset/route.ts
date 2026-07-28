import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, validateTenantOwnership } from '@/lib/auth/server';
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
    const { userId, error: authError } = await getAuthenticatedUser();
    if (authError || !userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

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
    const tenantId = String(formData.get('tenantId') ?? '').trim();
    const layer = String(formData.get('layer') ?? 'widget-body').trim().toLowerCase();

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'A non-empty file is required' },
        { status: 400 }
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'tenantId is required' },
        { status: 400 }
      );
    }

    if (!VALID_LAYERS.has(layer)) {
      return NextResponse.json(
        { success: false, error: `Invalid layer. Must be one of: ${Array.from(VALID_LAYERS).join(', ')}.` },
        { status: 400 }
      );
    }

    const ownership = await validateTenantOwnership(userId, tenantId);
    if (!ownership) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not manage this tenant' },
        { status: 403 }
      );
    }

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
      console.error('[ResellerUploadAsset] Storage upload failed:', uploadError.message, uploadError);
      return NextResponse.json(
        { success: false, error: `Failed to store asset: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ success: true, url: data.publicUrl, path, layer });
  } catch (error) {
    console.error('[ResellerUploadAsset] Unexpected error:', error);
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
