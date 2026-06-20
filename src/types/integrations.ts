export type IntegrationStatus = 'connected' | 'disconnected' | 'configuring';

export interface Integration {
  id: string;
  name: string;
  provider: 'whatsapp' | 'discord' | 'crm' | 'custom';
  status: IntegrationStatus;
  updatedAt: string;
  config: Record<string, unknown>;
}

export interface UpdateIntegrationPayload {
  status?: IntegrationStatus;
  config?: Record<string, unknown>;
}