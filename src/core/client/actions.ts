// Client Domain Actions (Server-Side Business Logic)

import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { Client, ClientPolicy, ClientMetrics, ClientTenant } from './types';

/**
 * Get client inventory for a dealership
 */
export async function getClientInventory(tenantId: string): Promise<Client[]> {
  // TODO: Implement inventory retrieval logic
  const supabase = await createSupabaseClient();
  
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching client inventory:', error);
    return [];
  }

  return data || [];
}

/**
 * Process a new lead for a dealership
 */
export async function processLead(leadData: {
  name: string;
  email: string;
  phone: string;
  tenant_id: string;
  source: string;
}): Promise<Client | null> {
  // TODO: Implement lead processing logic
  const supabase = await createSupabaseClient();
  
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: leadData.name,
      email: leadData.email,
      tenant_id: leadData.tenant_id,
      reseller_id: '', // Will be derived from tenant
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('Error processing lead:', error);
    return null;
  }

  return data;
}

/**
 * Get client by ID
 */
export async function getClientById(clientId: string): Promise<Client | null> {
  const supabase = await createSupabaseClient();
  
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (error) {
    console.error('Error fetching client:', error);
    return null;
  }

  return data;
}

/**
 * Get all clients for a reseller
 */
export async function getClientsByReseller(resellerId: string): Promise<Client[]> {
  const supabase = await createSupabaseClient();
  
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('reseller_id', resellerId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching clients:', error);
    return [];
  }

  return data || [];
}

/**
 * Get client count for a reseller
 */
export async function getClientCount(resellerId: string): Promise<number> {
  const supabase = await createSupabaseClient();
  
  const { count, error } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('reseller_id', resellerId)
    .eq('is_active', true);

  if (error) {
    console.error('Error counting clients:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Create a new client
 */
export async function createClient(clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Promise<Client | null> {
  const supabase = await createSupabaseClient();
  
  const { data, error } = await supabase
    .from('clients')
    .insert(clientData)
    .select()
    .single();

  if (error) {
    console.error('Error creating client:', error);
    return null;
  }

  return data;
}

/**
 * Update client information
 */
export async function updateClient(clientId: string, updates: Partial<Client>): Promise<Client | null> {
  const supabase = await createSupabaseClient();
  
  const { data, error } = await supabase
    .from('clients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select()
    .single();

  if (error) {
    console.error('Error updating client:', error);
    return null;
  }

  return data;
}
