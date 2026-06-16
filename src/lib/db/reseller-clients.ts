 // Types and functions for reseller client management
 // Real Supabase implementation with proper RLS support

 import { createBrowserClient, createClient as createServerClient } from "@/lib/supabase";

 export interface ResellerClient {
   id: string;
   tenant_id: string;
   reseller_id: string;
   name: string;
   industry: string | null;
   email: string | null;
   mobile: string | null;
   website: string | null;
   branding_colors: {
     primary: string;
     secondary: string;
   } | null;
   custom_assets: {
     header_url: string | null;
     footer_url: string | null;
   } | null;
   show_ovg_branding: boolean;
   pricing_tier_key: string | null;
   voice_id: string | null;
   system_prompt: string | null;
   is_active: boolean;
   created_at: string;
   updated_at: string;
 }

 /** 
  * Fetch all clients (tenants) for a given reseller.
  * Uses the server client (Route Handler context) with corrected RLS policy.
  */
 export async function getResellerClients(resellerId: string): Promise<ResellerClient[]> {
   const supabase = await createServerClient();

   const { data, error } = await supabase
     .from("tenants")
     .select("*")
     .eq("reseller_id", resellerId)
     .order("created_at", { ascending: false });

   if (error) {
     console.error("[getResellerClients] Supabase error:", error);
     throw new Error(`Failed to fetch reseller clients: ${error.message}`);
   }

   return (data as ResellerClient[]) || [];
 }

 /** 
  * Create a new client (tenant) under a reseller.
  * Uses the browser client — relies on corrected RLS policy for authorization.
  */
 export async function createResellerClient(
   client: Omit<ResellerClient, "id" | "created_at" | "updated_at">
 ): Promise<ResellerClient> {
   const supabase = createBrowserClient();

   const { data, error } = await supabase
     .from("tenants")
     .insert({
       tenant_id: crypto.randomUUID().slice(0, 8), // short unique slug
       name: client.name,
       reseller_id: client.reseller_id,
       industry: client.industry,
       email: client.email,
       mobile: client.mobile,
       website: client.website,
       branding_colors: client.branding_colors,
       custom_assets: client.custom_assets,
       show_ovg_branding: client.show_ovg_branding,
       pricing_tier_key: client.pricing_tier_key,
       voice_id: client.voice_id,
       system_prompt: client.system_prompt,
       is_active: true,
     })
     .select("*")
     .single();

   if (error) {
     console.error("[createResellerClient] Supabase error:", error);
     throw new Error(`Failed to create reseller client: ${error.message}`);
   }

   return data as ResellerClient;
 }

/** 
   * Update an existing reseller client with explicit ownership verification.
   * Uses the server client for Route Handler context with RLS enforcement.
   */
  export async function updateResellerClient(
    id: string,
    resellerId: string,
    updates: Partial<ResellerClient>
  ): Promise<ResellerClient | null> {
    const supabase = await createServerClient();

    // Explicitly scope query by both id and reseller_id for ownership verification
    const { data, error } = await supabase
      .from("tenants")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("reseller_id", resellerId)
      .select("*")
      .single();

    if (error) {
      console.error("[updateResellerClient] Supabase error:", error);
      throw new Error(`Failed to update reseller client: ${error.message}`);
    }

    return data as ResellerClient | null;
  }

/** 
   * Soft-delete a reseller client by setting is_active to false.
   * Now requires resellerId for explicit ownership verification.
   */
  export async function deleteResellerClient(
    resellerId: string,
    id: string
  ): Promise<boolean> {
    const supabase = await createServerClient();

    // Explicitly scope query by both id and reseller_id for ownership verification
    const { error } = await supabase
      .from("tenants")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("reseller_id", resellerId);

    if (error) {
      console.error("[deleteResellerClient] Supabase error:", error);
      throw new Error(`Failed to delete reseller client: ${error.message}`);
    }

    return true;
  }

 // ---------------------------------------------------------------------------
 // Deletion helpers – unified ownership‑checked deletion
 // ---------------------------------------------------------------------------

 /**
  * Delete multiple tenants belonging to a reseller.
  * @param resellerId - The UUID of the reseller performing the deletion.
  * @param tenantIds  - Array of tenant IDs to delete.
  * @throws Error if the Supabase delete operation fails.
  */
 export async function deleteResellerClients(
   resellerId: string,
   tenantIds: string[],
 ): Promise<void> {
   const supabase = await createServerClient();

   const { error } = await supabase
     .from('tenants')
     .delete()
     .in('id', tenantIds)
     .eq('reseller_id', resellerId);

   if (error) {
     console.error('[deleteResellerClients] Supabase error:', error);
     throw new Error(`Failed to delete tenants: ${error.message}`);
   }
 }

 /**
  * Delete a single tenant belonging to a reseller.
  * @param resellerId - The UUID of the reseller performing the deletion.
  * @param tenantId   - The ID of the tenant to delete.
  * @throws Error if the Supabase delete operation fails.
  */
 export async function deleteResellerTenant(
   resellerId: string,
   tenantId: string,
 ): Promise<void> {
   const supabase = await createServerClient();

   const { error } = await supabase
     .from('tenants')
     .delete()
     .eq('id', tenantId)
     .eq('reseller_id', resellerId);

   if (error) {
     console.error('[deleteResellerTenant] Supabase error:', error);
     throw new Error(`Failed to delete tenant: ${error.message}`);
   }
 }