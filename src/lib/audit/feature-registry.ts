import type { SYSTEM_COMMAND } from './command-types';
import { SYSTEM_COMMANDS } from './command-types';
import type { FeatureScope } from './command-types';

export interface FeatureRegistryEntry {
  actionType: SYSTEM_COMMAND;
  scope: FeatureScope;
  uiModal?: string;
  handler?: string;
  requiresAuth: boolean;
  description: string;
}

export const FEATURE_REGISTRY: Record<SYSTEM_COMMAND, FeatureRegistryEntry> = {
  SINGLE: {
    actionType: 'SINGLE',
    scope: 'client',
    uiModal: 'src/components/ai-intelligence/DeploymentModal.tsx',
    handler: 'DeploymentModal',
    requiresAuth: true,
    description: 'Single client deployment or action execution',
  },
  BULK: {
    actionType: 'BULK',
    scope: 'client',
    uiModal: 'src/components/ai-intelligence/DeploymentModal.tsx',
    handler: 'DeploymentModal',
    requiresAuth: true,
    description: 'Bulk multi-client deployment or action execution',
  },
  NO_MATCH: {
    actionType: 'NO_MATCH',
    scope: 'client',
    requiresAuth: false,
    description: 'AI could not match user intent to a known command',
  },
  DELETE_CLIENT: {
    actionType: 'DELETE_CLIENT',
    scope: 'reseller',
    uiModal: 'src/components/reseller/modals/UniversalCommandModal.tsx',
    handler: 'UniversalCommandModal',
    requiresAuth: true,
    description: 'Voice-driven client deletion flow',
  },
  SYSTEM_BULK_CONFIRM: {
    actionType: 'SYSTEM_BULK_CONFIRM',
    scope: 'reseller',
    requiresAuth: true,
    description: 'Confirm a previously staged bulk action',
  },
  SYSTEM_BULK_CANCEL: {
    actionType: 'SYSTEM_BULK_CANCEL',
    scope: 'reseller',
    requiresAuth: true,
    description: 'Cancel a previously staged bulk action',
  },
  SYSTEM_FILTER_GRID: {
    actionType: 'SYSTEM_FILTER_GRID',
    scope: 'reseller',
    requiresAuth: false,
    description: 'Filter the client grid view by criteria',
  },
  SYSTEM_UPDATE_BRANDING: {
    actionType: 'SYSTEM_UPDATE_BRANDING',
    scope: 'client',
    uiModal: 'src/components/reseller/ClientBrandingStudio.tsx',
    handler: 'ClientBrandingStudio',
    requiresAuth: true,
    description: 'Update your widget branding and AI persona configuration',
  },
  SYSTEM_HELP: {
    actionType: 'SYSTEM_HELP',
    scope: 'client',
    uiModal: 'src/components/studio/CapabilitiesModal.tsx',
    handler: 'CapabilitiesModal',
    requiresAuth: false,
    description: 'Display available AI capabilities and commands',
  },
  SYSTEM_NOTE: {
    actionType: 'SYSTEM_NOTE',
    scope: 'reseller',
    requiresAuth: true,
    description: 'Attach a voice note to a client record',
  },
  SYSTEM_DISARM: {
    actionType: 'SYSTEM_DISARM',
    scope: 'reseller',
    requiresAuth: true,
    description: 'Cancel or disarm an active voice command session',
  },
  SYSTEM_EXPLAIN: {
    actionType: 'SYSTEM_EXPLAIN',
    scope: 'client',
    requiresAuth: false,
    description: 'Explain a capability, command, or system behavior',
  },
  SYSTEM_TELEMETRY: {
    actionType: 'SYSTEM_TELEMETRY',
    scope: 'reseller',
    requiresAuth: true,
    description: 'Report or display system telemetry and usage metrics',
  },
  SYSTEM_APPLY_BRANDING_THEME: {
    actionType: 'SYSTEM_APPLY_BRANDING_THEME',
    scope: 'client',
    uiModal: 'src/components/widget/ChatWidget.tsx',
    handler: 'ChatWidget',
    requiresAuth: true,
    description: 'AI-suggested branding theme staged in ChatWidget for confirmation',
  },
  SYSTEM_EXECUTE_BUILD: {
    actionType: 'SYSTEM_EXECUTE_BUILD',
    scope: 'infrastructure',
    uiModal: undefined,
    handler: 'BuildPipelineHandler',
    requiresAuth: true,
    description: 'Triggers build.js pipeline and asset sync.',
  },
  SYSTEM_SYNC_CRM: {
    actionType: 'SYSTEM_SYNC_CRM',
    scope: 'infrastructure',
    uiModal: undefined,
    handler: 'CrmSyncHandler',
    requiresAuth: true,
    description: 'Initiates lead management CRM integration sequence.',
  },
  SYSTEM_RELOAD_ASSETS: {
    actionType: 'SYSTEM_RELOAD_ASSETS',
    scope: 'infrastructure',
    uiModal: undefined,
    handler: 'AssetReloadHandler',
    requiresAuth: true,
    description: 'Forces dynamic cache busting/refresh for environments.',
  },
} as const;

export { SYSTEM_COMMANDS, type SYSTEM_COMMAND, type FeatureScope };
