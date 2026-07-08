import { BuildPipelineHandler } from './build-pipeline';
import { CrmSyncHandler } from './crm-sync';
import { AssetReloadHandler } from './asset-reload';

export const ORCHESTRATOR_HANDLERS: Record<string, (payload?: unknown) => Promise<unknown>> = {
  BuildPipelineHandler,
  CrmSyncHandler,
  AssetReloadHandler,
};

export { BuildPipelineHandler, CrmSyncHandler, AssetReloadHandler };
