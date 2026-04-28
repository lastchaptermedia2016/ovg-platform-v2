// Client Domain Types

export interface ClientTenant {
  id: string;
  dealership_name: string;
  dealership_code: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  settings: {
    timezone: string;
    currency: string;
    language: string;
  };
  branding: {
    primary_color: string;
    secondary_color: string;
    logo_url: string | null;
  };
  reseller_id: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  tenant_id: string;
  reseller_id: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface ClientPolicy {
  id: string;
  client_id: string;
  policy_type: string;
  policy_data: Record<string, any>;
  created_at: string;
}

export interface ClientMetrics {
  client_id: string;
  total_conversations: number;
  total_tokens: number;
  avg_response_time: number;
  satisfaction_score: number;
}
