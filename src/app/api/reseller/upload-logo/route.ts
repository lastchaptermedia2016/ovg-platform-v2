import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, validateTenantOwnership } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'brand-logos';
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const STORAGE_PATH = (tenantId: string) => `${tenantId}/logo`;

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
      console.error('[ResellerUploadLogo] Storage upload failed:', uploadError.message);
      return NextResponse.json(
        { success: false, error: 'Failed to store logo asset' },
        { status: 500 }
      );
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ success: true, url: data.publicUrl, path });
  } catch (error) {
    console.error('[ResellerUploadLogo] Unexpected error:', error);
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
