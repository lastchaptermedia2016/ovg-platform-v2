import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'widget-assets';
const MAX_BYTES = 10 * 1024 * 1024;

export interface UploadResult {
  url: string;
  key?: string;
}

export async function uploadBrandingAsset(
  ownerId: string,
  type: string,
  file: File,
  categoryPrefix = 'reseller'
): Promise<string> {
  if (!file.size || file.size > MAX_BYTES) {
    throw new Error('File too large. Maximum size is 10 MB.');
  }

  const mime = file.type?.toLowerCase() ?? '';
  if (!mime.startsWith('image/')) {
    throw new Error('Unsupported file type. Only image files are allowed.');
  }

  const path = `${categoryPrefix}/${ownerId}/${type}/bg`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: mime,
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) {
    console.error('[uploadBrandingAsset] Storage upload failed:', uploadError.message);
    throw new Error('Failed to store asset');
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
