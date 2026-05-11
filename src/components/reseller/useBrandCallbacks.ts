import { useCallback } from 'react';

/**
 * PRODUCTION EXCELLENCE NOTE:
 * Moving logic to a custom hook decouples the UI from the API layer.
 */

interface BrandingConfig {
  headerUrl: string;
  footerUrl: string;
  primaryColor: string;
  secondaryColor: string;
  botPersonality: string;
  template: string;
  greeting?: string;
}

interface UseBrandCallbacksProps {
  brandingConfig: BrandingConfig;
  speak: (msg: string) => void;
  startListening: () => void;
  setIsAiSyncing: (loading: boolean) => void;
  clientId: string;
  // Passing these as props ensures the hook stays flexible
  updateBrandingConfig: (id: string, config: BrandingConfig) => Promise<void>;
  updateTenantGreeting: (id: string, greeting: string) => Promise<void>;
}

export const useBrandCallbacks = ({
  brandingConfig,
  speak,
  startListening,
  setIsAiSyncing,
  clientId,
  updateBrandingConfig,
  updateTenantGreeting
}: UseBrandCallbacksProps) => {

  const syncBrandWithURL = useCallback(async () => {
    if (!clientId) return;
    setIsAiSyncing(true);
    try {
      const response = await fetch('/api/ai/sync-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const data = await response.json();
      
      // Success feedback
      speak("I've analyzed the website and synced your brand colors.");
      return data;
    } catch (error) {
      console.error('[Sync Error]:', error);
    } finally {
      setIsAiSyncing(false);
      startListening();
    }
  }, [clientId, speak, startListening, setIsAiSyncing]);

  const applyAIVibe = useCallback(async (vibe: string) => {
    setIsAiSyncing(true);
    try {
      const response = await fetch('/api/ai/apply-vibe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clientId, 
          vibe, 
          currentConfig: brandingConfig 
        }),
      });
      const data = await response.json();
      speak(`Applied the ${vibe} vibe. How does it look?`);
      return data;
    } catch (error) {
      console.error('[Vibe Error]:', error);
    } finally {
      setIsAiSyncing(false);
      startListening();
    }
  }, [clientId, brandingConfig, speak, startListening, setIsAiSyncing]);

  const instantSave = useCallback(async () => {
    setIsAiSyncing(true);
    try {
      // Run updates in parallel for performance
      await Promise.all([
        updateBrandingConfig(clientId, brandingConfig),
        brandingConfig.greeting 
          ? updateTenantGreeting(clientId, brandingConfig.greeting) 
          : Promise.resolve()
      ]);
      speak("Your changes are saved and live.");
    } catch (error) {
      console.error('[Save Error]:', error);
    } finally {
      setIsAiSyncing(false);
      startListening();
    }
  }, [clientId, brandingConfig, speak, startListening, setIsAiSyncing, updateBrandingConfig, updateTenantGreeting]);

  return {
    syncBrandWithURL,
    applyAIVibe,
    instantSave,
  };
};