import { supabase } from "@/lib/supabase";

/**
 * uploadBrandingAsset - Upload a branding asset to Supabase Storage
 * 
 * @param resellerId - The UUID of the reseller
 * @param type - The type of asset (e.g., 'header', 'footer')
 * @param file - The file to upload
 * @returns The public URL of the uploaded file
 */
export async function uploadBrandingAsset(
  resellerId: string,
  type: 'header' | 'footer',
  file: File
): Promise<string> {
  // Generate file path: reseller_{resellerId}/{type}.png
  const filePath = `reseller_${resellerId}/${type}.png`;

  // Upload to Supabase Storage with upsert to overwrite existing files
  const { data, error } = await supabase.storage
    .from('branding')
    .upload(filePath, file, {
      upsert: true,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(`Failed to upload ${type} image: ${error.message}`);
  }

  // Get public URL
  const { data: publicUrlData } = supabase.storage
    .from('branding')
    .getPublicUrl(filePath);

  const publicUrl = publicUrlData.publicUrl;

  // Update resellers table with new public URL
  const { error: updateError } = await supabase
    .from('resellers')
    .update({
      branding_assets: {
        [`${type}_url`]: publicUrl,
      },
    })
    .eq('id', resellerId);

  if (updateError) {
    throw new Error(`Failed to update reseller branding assets: ${updateError.message}`);
  }

  return publicUrl;
}

/**
 * deleteBrandingAsset - Delete a branding asset from Supabase Storage
 * 
 * @param resellerId - The UUID of the reseller
 * @param type - The type of asset (e.g., 'header', 'footer')
 */
export async function deleteBrandingAsset(
  resellerId: string,
  type: 'header' | 'footer'
): Promise<void> {
  const filePath = `reseller_${resellerId}/${type}.png`;

  const { error } = await supabase.storage
    .from('branding')
    .remove([filePath]);

  if (error) {
    throw new Error(`Failed to delete ${type} image: ${error.message}`);
  }

  // Update resellers table to null the URL
  const { error: updateError } = await supabase
    .from('resellers')
    .update({
      branding_assets: {
        [`${type}_url`]: null,
      },
    })
    .eq('id', resellerId);

  if (updateError) {
    throw new Error(`Failed to update reseller branding assets: ${updateError.message}`);
  }
}
