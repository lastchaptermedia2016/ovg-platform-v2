// Production Excellence: Fix missing reseller_slug metadata for existing users
import { createClient } from '@/lib/supabase/server';
import { createClient as createBrowserClient } from '@/lib/supabase/client';

export async function fixUserResellerMetadata(userId: string, email: string) {
  try {
    // Generate slug from email
    const defaultSlug = email.split('@')[0]?.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-') || 'dashboard';
    
    // Use service role client for tenant creation (server-side)
    const supabase = await createClient();
    
    // Create tenant record for user first
    const { error: tenantError } = await supabase
      .from("tenants")
      .upsert({
        tenant_id: defaultSlug,
        name: email.split('@')[0] || 'Default User',
        reseller_id: userId,
        branding_color: '#0097b2',
        voice_id: null,
        system_prompt: null
      }, {
        onConflict: 'tenant_id'  // match unique constraint on tenant_id
      })
      .select()
      .single();
    
    if (tenantError) {
      console.error("OVG-PLATFORM-V2: Failed to create tenant record:", tenantError);
      return { success: false, error: tenantError };
    }
    
    console.log("OVG-PLATFORM-V2: Successfully created tenant record for", userId);
    
    // Note: User metadata update needs to be done client-side or via service role
    // For now, we'll return the slug and let the client handle the metadata update
    return { success: true, slug: defaultSlug, needsClientUpdate: true };
    
  } catch (error) {
    console.error("OVG-PLATFORM-V2: Error fixing user metadata:", error);
    return { success: false, error };
  }
}

// Production Excellence: Client-side metadata update function
export async function updateUserMetadataClient(slug: string) {
  try {
    const supabase = createBrowserClient();
    
    const { error: updateError } = await supabase.auth.updateUser({
      data: { 
        user_metadata: { 
          reseller_slug: slug,
          role: 'reseller'
        } 
      }
    });
    
    if (updateError) {
      console.error("OVG-PLATFORM-V2: Failed to update user metadata client-side:", updateError);
      return { success: false, error: updateError };
    }
    
    console.log("OVG-PLATFORM-V2: Successfully updated user metadata client-side with slug", slug);
    return { success: true, slug };
    
  } catch (error) {
    console.error("OVG-PLATFORM-V2: Error updating user metadata client-side:", error);
    return { success: false, error };
  }
}

// Production Excellence: Batch fix for all users missing reseller_slug
export async function fixAllUserMetadata() {
  try {
    const supabase = await createClient();
    
    // Get all users (this requires service role)
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.error("OVG-PLATFORM-V2: Failed to list users:", error);
      return { success: false, error };
    }
    
    const fixes = [];
    
    for (const user of users || []) {
      if (!user.user_metadata?.reseller_slug && user.email) {
        const result = await fixUserResellerMetadata(user.id, user.email);
        fixes.push({
          userId: user.id,
          email: user.email,
          ...result
        });
      }
    }
    
    console.log("OVG-PLATFORM-V2: Fixed metadata for", fixes.length, "users");
    return { success: true, fixes };
    
  } catch (error) {
    console.error("OVG-PLATFORM-V2: Error in batch fix:", error);
    return { success: false, error };
  }
}
