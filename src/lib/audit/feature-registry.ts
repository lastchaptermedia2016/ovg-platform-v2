import type { SYSTEM_COMMAND } from './command-types';
import { SYSTEM_COMMANDS } from './command-types';

export interface FeatureRegistryEntry {
  actionType: SYSTEM_COMMAND;
  uiModal?: string;
  handler?: string;
  requiresAuth: boolean;
  description: string;
}

export const FEATURE_REGISTRY: Record<SYSTEM_COMMAND, FeatureRegistryEntry> = {
  SINGLE: {
    actionType: 'SINGLE',
    uiModal: 'src/components/ai-intelligence/DeploymentModal.tsx',
    handler: 'DeploymentModal',
    requiresAuth: true,
    description: 'Single client deployment or action execution',
  },
  BULK: {
    actionType: 'BULK',
    uiModal: 'src/components/ai-intelligence/DeploymentModal.tsx',
    handler: 'DeploymentModal',
    requiresAuth: true,
    description: 'Bulk multi-client deployment or action execution',
  },
  NO_MATCH: {
    actionType: 'NO_MATCH',
    requiresAuth: false,
    description: 'AI could not match user intent to a known command',
  },
  DELETE_CLIENT: {
    actionType: 'DELETE_CLIENT',
    uiModal: 'src/components/reseller/modals/UniversalCommandModal.tsx',
    handler: 'UniversalCommandModal',
    requiresAuth: true,
    description: 'Voice-driven client deletion flow',
  },
  SYSTEM_BULK_CONFIRM: {
    actionType: 'SYSTEM_BULK_CONFIRM',
    requiresAuth: true,
    description: 'Confirm a previously staged bulk action',
  },
  SYSTEM_BULK_CANCEL: {
    actionType: 'SYSTEM_BULK_CANCEL',
    requiresAuth: true,
    description: 'Cancel a previously staged bulk action',
  },
  SYSTEM_FILTER_GRID: {
    actionType: 'SYSTEM_FILTER_GRID',
    requiresAuth: false,
    description: 'Filter the client grid view by criteria',
  },
  SYSTEM_UPDATE_BRANDING: {
    actionType: 'SYSTEM_UPDATE_BRANDING',
    uiModal: 'src/components/reseller/ClientBrandingStudio.tsx',
    handler: 'ClientBrandingStudio',
    requiresAuth: true,
    description: 'Update reseller or client branding configuration',
  },
  SYSTEM_HELP: {
    actionType: 'SYSTEM_HELP',
    uiModal: 'src/components/studio/CapabilitiesModal.tsx',
    handler: 'CapabilitiesModal',
    requiresAuth: false,
    description: 'Display available AI capabilities and commands',
  },
  SYSTEM_NOTE: {
    actionType: 'SYSTEM_NOTE',
    requiresAuth: true,
    description: 'Attach a voice note to a client record',
  },
  SYSTEM_DISARM: {
    actionType: 'SYSTEM_DISARM',
    requiresAuth: true,
    description: 'Cancel or disarm an active voice command session',
  },
  SYSTEM_EXPLAIN: {
    actionType: 'SYSTEM_EXPLAIN',
    requiresAuth: false,
    description: 'Explain a capability, command, or system behavior',
  },
  SYSTEM_TELEMETRY: {
    actionType: 'SYSTEM_TELEMETRY',
    requiresAuth: true,
    description: 'Report or display system telemetry and usage metrics',
  },
  SYSTEM_APPLY_BRANDING_THEME: {
    actionType: 'SYSTEM_APPLY_BRANDING_THEME',
    uiModal: 'src/components/widget/ChatWidget.tsx',
    handler: 'ChatWidget',
    requiresAuth: true,
    description: 'AI-suggested branding theme staged in ChatWidget for confirmation',
  },
  SYSTEM_EXECUTE_BUILD: {
    actionType: 'SYSTEM_EXECUTE_BUILD',
    uiModal: undefined,
    handler: 'BuildPipelineHandler',
    requiresAuth: true,
    description: 'Triggers build.js pipeline and asset sync.',
  },
  SYSTEM_SYNC_CRM: {
    actionType: 'SYSTEM_SYNC_CRM',
    uiModal: undefined,
    handler: 'CrmSyncHandler',
    requiresAuth: true,
    description: 'Initiates lead management CRM integration sequence.',
  },
  SYSTEM_RELOAD_ASSETS: {
    actionType: 'SYSTEM_RELOAD_ASSETS',
    uiModal: undefined,
    handler: 'AssetReloadHandler',
    requiresAuth: true,
    description: 'Forces dynamic cache busting/refresh for environments.',
  },
} as const;

export { SYSTEM_COMMANDS, type SYSTEM_COMMAND };
