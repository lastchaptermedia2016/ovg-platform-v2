'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { ColorPicker } from '@/components/reseller/ColorPicker';
import { useVoiceCommand } from '@/hooks/use-voice-command';
import { Client as ClientType } from '@/types/index';
import { getActionValidation, SERVICE_CATALOG, ServiceCapability } from '@/lib/hannah-service-catalog';
import { createHarmoniousGreeting, VisualStyle } from '@/lib/voice-visual-harmony';

interface ClientWithBranding extends ClientType {
  industry?: string;
  pricing_tier_key?: string;
}

interface InitialConfig {
  branding?: Partial<BrandingConfig>;
  features?: {
    aiInsightBadge?: boolean;
    aiDesignMirror?: boolean;
    customCss?: boolean;
  };
}

interface ClientBrandingStudioProps {
  clientId: string;
  resellerSlug: string;
  clients: ClientWithBranding[];
  onClientChange: (clientId: string) => void;
  initialConfig?: InitialConfig;
  planTier?: string;
}

interface BrandingConfig {
  headerBackground: string;
// other properties...
  headerBackgroundType: 'solid' | 'gradient' | 'image';
  headerGradientStart: string;
  headerGradientEnd: string;
  headerImage: string;
  headerOpacity: number;
  footerBackground: string;
  footerBackgroundType: 'solid' | 'gradient' | 'image';
  footerGradientStart: string;
  footerGradientEnd: string;
  footerImage: string;
  footerOpacity: number;
  logoUrl: string;
  aiInsightBadge: boolean;
  aiDesignMirror: boolean;
  customCss: boolean;
}

export function ClientBrandingStudio({
  clientId,
  clients,
  onClientChange,
  initialConfig,
  planTier,
}: ClientBrandingStudioProps) {
  const [config, setConfig] = useState<BrandingConfig>({
    headerBackground: initialConfig?.branding?.headerBackground || '#0097b2',
    headerBackgroundType: initialConfig?.branding?.headerBackgroundType || 'solid',
    headerGradientStart: initialConfig?.branding?.headerGradientStart || '#0097b2',
    headerGradientEnd: initialConfig?.branding?.headerGradientEnd || '#226683',
    headerImage: initialConfig?.branding?.headerImage || '',
    headerOpacity: initialConfig?.branding?.headerOpacity || 0.75,
    footerBackground: initialConfig?.branding?.footerBackground || '#050a14',
    footerBackgroundType: initialConfig?.branding?.footerBackgroundType || 'solid',
    footerGradientStart: initialConfig?.branding?.footerGradientStart || '#050a14',
    footerGradientEnd: initialConfig?.branding?.footerGradientEnd || '#1a1a2e',
    footerImage: initialConfig?.branding?.footerImage || '',
    footerOpacity: initialConfig?.branding?.footerOpacity || 0.75,
    logoUrl: initialConfig?.branding?.logoUrl || '',
    aiInsightBadge: initialConfig?.features?.aiInsightBadge ?? true,
    aiDesignMirror: initialConfig?.features?.aiDesignMirror ?? false,
    customCss: initialConfig?.features?.customCss ?? false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isAiSyncing, setIsAiSyncing] = useState(false);
  const [_isLoadingConfig, _setIsLoadingConfig] = useState(false);
  const [vibeInput, setVibeInput] = useState('');
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  
  // Guided Onboarding State
  const [showGuidedSetup, setShowGuidedSetup] = useState(false);

  // Refs for audio cleanup
  const currentAudioRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isSpeakingRef = useRef(false);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Voice-Visual Harmony State
  const [generatedGreeting, setGeneratedGreeting] = useState<string>('');
  const [greetingExplanation, setGreetingExplanation] = useState<string>('');
  const [showGreetingPreview, setShowGreetingPreview] = useState(false);
  const [_isGeneratingGreeting, setIsGeneratingGreeting] = useState(false);
  
  // Conversational Greeting Edit State
  const [isEditingGreeting, setIsEditingGreeting] = useState(false);
  const [greetingEditMode, setGreetingEditMode] = useState<'suggest' | 'dictate' | null>(null);
  const [isLongFormSTT, setIsLongFormSTT] = useState(false);
  const [dictatedGreeting, setDictatedGreeting] = useState<string>('');
  
  // Mic Persistence State
  const [forcedContinuousMode, setForcedContinuousMode] = useState(false);
  
  // Privacy State for Hannah
  const [isHannahAwake, setIsHannahAwake] = useState(true);
  const [previousClientId, setPreviousClientId] = useState<string | null>(null);

  // Hannah TTS function with cleanup and privacy check
  const speak = useCallback(async (text: string) => {
    if (!isSpeakerEnabled) return;
    if (!isHannahAwake && !text.includes('going to sleep') && !text.includes('awake')) return; // Privacy check
    if (isSpeakingRef.current) return; // Prevent multiple simultaneous TTS
    
    isSpeakingRef.current = true;
    
    // Cleanup any existing audio
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      } catch {
        // Audio already stopped or disconnected
      }
      audioSourceRef.current = null;
    }
    
    if (currentAudioRef.current) {
      try {
        if (currentAudioRef.current.state !== 'closed') {
          currentAudioRef.current.close();
        }
      } catch {
        // Audio context already closed
      }
      currentAudioRef.current = null;
    }
    
    try {
      const response = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'hannah' }),
      });

      if (!response.ok) throw new Error('TTS failed');

      const audioBuffer = await response.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const audioSource = audioContext.createBufferSource();
      const audioBufferData = await audioContext.decodeAudioData(audioBuffer);
      
      // Store refs for cleanup
      currentAudioRef.current = audioContext;
      audioSourceRef.current = audioSource;
      
      audioSource.buffer = audioBufferData;
      audioSource.connect(audioContext.destination);
      audioSource.onended = () => {
        audioContext.close();
        currentAudioRef.current = null;
        audioSourceRef.current = null;
        isSpeakingRef.current = false;
      };
      audioSource.start();
    } catch (err) {
      console.error('TTS error:', err);
      // Cleanup on error
      currentAudioRef.current = null;
      audioSourceRef.current = null;
      isSpeakingRef.current = false;
    }
  }, [isSpeakerEnabled, isHannahAwake]);

  // Voice command hook for STT
  const {
    isListening,
    isProcessing,
    startListening,
    stopListening,
  } = useVoiceCommand({
    skipAIPipeline: true,
    forcedContinuousMode,
    silenceDuration: 3000, // 3 seconds for thinking pauses
    onTranscript: (text) => {
      setVoiceTranscript(text);

      if (isLongFormSTT) {
        setDictatedGreeting(text);
      }

      const lowerText = text.toLowerCase();
      const sleepCommands = ['hannah go to sleep', 'hannah sleep', 'go to sleep', 'be quiet', 'stop talking'];
      if (sleepCommands.some(cmd => lowerText.includes(cmd))) {
        setIsHannahAwake(false);
        speak('Going to sleep. Just tap the mic when you need me again.');
        return;
      }

      const wakeCommands = ['hannah wake up', 'hannah awake', 'wake up', 'are you there'];
      if (wakeCommands.some(cmd => lowerText.includes(cmd))) {
        setIsHannahAwake(true);
        speak('I\'m awake and ready to help!');
        return;
      }

      processVoiceDesignCommand(text);
    },
  });

  const syncBrandWithURL = useCallback(async () => {
    if (!clientId) return;
    setIsAiSyncing(true);

    try {
      const response = await fetch('/api/ai/sync-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });

      if (!response.ok) {
        throw new Error('Failed to sync brand from URL');
      }

      const data = await response.json();
      speak("I've analyzed the website and synced your brand colors.");
      return data;
    } catch (err) {
      console.error('Brand sync error:', err);
      speak('I had trouble syncing the brand. Please try again.');
    } finally {
      setIsAiSyncing(false);
      startListening();
    }
  }, [clientId, speak, startListening]);

  const applyAIVibe = useCallback(async (vibe: string) => {
    if (!clientId) return;
    setIsAiSyncing(true);

    try {
      const response = await fetch('/api/ai/apply-vibe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, vibe, currentConfig: config }),
      });

      if (!response.ok) {
        throw new Error('Failed to apply AI vibe');
      }

      const data = await response.json();
      speak(`Applied the ${vibe} vibe. How does it look?`);
      return data;
    } catch (err) {
      console.error('AI vibe error:', err);
      speak('I had trouble applying the AI vibe. Please try again.');
    } finally {
      setIsAiSyncing(false);
      startListening();
    }
  }, [clientId, config, speak, startListening]);

  const updateConfig = (key: keyof BrandingConfig, value: string | number | boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    
    // Action Confirmation - Hannah validates the change
    const validation = getActionValidation(String(key));
    if (validation && isSpeakerEnabled) {
      // Debounce validations to avoid too much speaking
      setTimeout(() => speak(validation), 500);
    }
  };

  const getHeaderBackground = () => {
    if (config.headerBackgroundType === 'image') {
      return config.headerImage || '#0097b2';
    }
    if (config.headerBackgroundType === 'gradient') {
      return `linear-gradient(135deg, ${config.headerGradientStart}, ${config.headerGradientEnd})`;
    }
    return config.headerBackground;
  };

  const getFooterBackground = () => {
    if (config.footerBackgroundType === 'image') {
      return config.footerImage || '#050a14';
    }
    if (config.footerBackgroundType === 'gradient') {
      return `linear-gradient(135deg, ${config.footerGradientStart}, ${config.footerGradientEnd})`;
    }
    return config.footerBackground;
  };

  // Draft & Speak Hook - Generate harmonious greeting
  const generateHarmoniousGreeting = useCallback(async () => {
    if (!clientId || !clients.length) return;
    
    setIsGeneratingGreeting(true);
    
    try {
      const selectedClient = clients.find(c => c.id === clientId);
      if (!selectedClient) return;
      
      // Create visual style from current config
      const visualStyle: VisualStyle = {
        headerType: config.headerBackgroundType,
        primaryColor: config.headerBackground,
        secondaryColor: config.headerBackgroundType === 'gradient' ? config.headerGradientEnd : undefined,
        opacity: config.headerOpacity,
        hasGlassmorphism: config.headerBackgroundType === 'gradient' && config.headerOpacity < 0.9,
        industry: selectedClient.industry
      };
      
      // Generate harmonious greeting
      const { greeting, explanation } = createHarmoniousGreeting(
        visualStyle,
        selectedClient.name,
        selectedClient.industry
      );
      
      setGeneratedGreeting(greeting);
      setGreetingExplanation(explanation);
      
      // The Reveal - Hannah explains and previews
      speak(explanation);
      
      // Small delay, then preview the greeting
      setTimeout(() => {
        speak("Listen to how it sounds...");
        setTimeout(() => {
          speak(greeting);
          setShowGreetingPreview(true);
        }, 1000);
      }, 3000);
      
    } catch (err) {
      console.error('Greeting generation error:', err);
      speak('I had trouble creating the greeting. Let me try a simpler approach.');
    } finally {
      setIsGeneratingGreeting(false);
    }
  }, [clientId, clients, config, speak]);

  // Handle greeting edit request
  const handleGreetingEditRequest = useCallback(() => {
    setIsEditingGreeting(true);
    setGreetingEditMode(null);
    speak('Should I draft a new one for you, or do you want to dictate it?');
  }, [speak]);

  // Handle draft new greeting
  const handleDraftNewGreeting = useCallback(() => {
    speak('I\'ll create a new variation that matches our visual style. Give me a moment...');
    generateHarmoniousGreeting();
    setIsEditingGreeting(false);
    setGreetingEditMode(null);
  }, [speak, generateHarmoniousGreeting]);

  // Handle dictate greeting
  const handleDictateGreeting = useCallback(() => {
    setIsLongFormSTT(true);
    setDictatedGreeting('');
    speak('Go ahead and dictate your welcome message. Say "stop" or "done" when you\'re finished.');
    startListening();
  }, [speak, startListening]);

  // Stop long-form STT
  const stopLongFormSTT = useCallback(() => {
    setIsLongFormSTT(false);
    setGeneratedGreeting(dictatedGreeting);
    setGreetingExplanation('Dictated by you - ready to save!');
    setIsEditingGreeting(false);
    setGreetingEditMode(null);
    stopListening();
    speak('Got it! Your dictated greeting has been saved.');
  }, [dictatedGreeting, speak, stopListening]);

  const openClientSelector = useCallback(() => {
    setShowGuidedSetup(false);
    speak('You can choose another client from the client list on the left.');
  }, [speak]);

  // Stop long-form STT
  // Feature locking based on plan tier
  const isFeatureLocked = useCallback((feature: string) => {
    if (!planTier) return false;
    const lockedFeatures: Record<string, string[]> = {
      'standard': ['aiInsightBadge', 'aiDesignMirror', 'customCss'],
      'professional': ['aiDesignMirror', 'customCss'],
      'enterprise': []
    };
    return lockedFeatures[planTier]?.includes(feature) || false;
  }, [planTier]);

  // Handle save
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/tenants/update-config-with-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: clientId,
          configPatch: {
            branding: config,
            features: {
              aiInsightBadge: config.aiInsightBadge,
              aiDesignMirror: config.aiDesignMirror,
              customCss: config.customCss,
            },
          },
          aiSettings: {
            initial_greeting: generatedGreeting,
            voice_persona: 'auto-generated',
          }
        }),
      });

      if (!response.ok) throw new Error('Failed to save configuration');

      setSaveMessage('✨ Perfect! Both the visual design and greeting have been saved.');
      speak('Excellent! Your complete branding setup is now live.');
      setShowGreetingPreview(false);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSaveMessage(errorMessage || 'Error saving configuration');
      speak('Sorry, I had trouble saving your changes.');
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  }, [clientId, config, generatedGreeting, speak]);

  // Execute Full Design Pass
  const executeFullDesignPass = useCallback(async () => {
    speak('Running complete brand analysis and design optimization. This might take a moment...');

    try {
      await syncBrandWithURL();
      
      const selectedClient = clients.find(c => c.id === clientId);
      if (selectedClient?.industry) {
        const vibeDescription = `${selectedClient.industry} optimized professional branding`;
        await applyAIVibe(vibeDescription);
      }
      
      if (planTier && planTier !== 'standard') {
        setConfig(prev => ({
          ...prev,
          headerBackgroundType: 'gradient',
          headerGradientStart: '#0891b2',
          headerGradientEnd: '#0e7490',
          headerOpacity: 0.85,
        }));
        speak('Applied premium glassmorphic effects for modern appeal.');
      }
      
      speak('Full design pass complete! Your brand now has optimized colors, professional styling, and enhanced visual appeal.');
    } catch (err) {
      console.error('Full design pass error:', err);
      speak('I encountered an issue during the design pass. Let me try a simpler approach.');
    }
  }, [clientId, clients, planTier, speak, applyAIVibe, syncBrandWithURL]);

  const applySuggestedConfig = useCallback(async () => {
    setShowGuidedSetup(false);
    speak('Applying the suggested design now.');
    await executeFullDesignPass();
  }, [executeFullDesignPass, speak]);

  // Execute Service Capability
  const executeServiceCapability = useCallback(async (capability: ServiceCapability) => {
    speak(`Executing ${capability.name.toLowerCase()}...`);

    switch (capability.name) {
      case 'Brand Sync':
        await syncBrandWithURL();
        break;
      case 'Industry Vibe': {
        const selectedClient = clients.find(c => c.id === clientId);
        if (selectedClient?.industry) {
          await applyAIVibe(`${selectedClient.industry} professional branding`);
        }
        break;
      }
      case 'Glassmorphism Design':
        setConfig(prev => ({
          ...prev,
          headerBackgroundType: 'gradient',
          headerGradientStart: '#0891b2',
          headerGradientEnd: '#0e7490',
          headerOpacity: 0.85,
        }));
        speak('Applied modern glassmorphic design with optimal transparency.');
        break;
      case 'Color Harmony':
        speak('Analyzing current color scheme for optimal harmony...');
        break;
      case 'Opacity Tuning':
        setConfig(prev => ({
          ...prev,
          headerOpacity: 0.8,
          footerOpacity: 0.8,
        }));
        speak('Optimized transparency for perfect readability and modern aesthetics.');
        break;
      default:
        speak(`Executing ${capability.description.toLowerCase()}.`);
    }
  }, [clientId, clients, speak, applyAIVibe, syncBrandWithURL]);

  // Instant Save - Save both visuals and greeting
  const instantSave = useCallback(async () => {
    if (!generatedGreeting) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/tenants/update-config-with-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: clientId,
          configPatch: {
            branding: config,
            features: {
              aiInsightBadge: config.aiInsightBadge,
              aiDesignMirror: config.aiDesignMirror,
              customCss: config.customCss,
            },
          },
          aiSettings: {
            initial_greeting: generatedGreeting,
            voice_persona: 'auto-generated',
          }
        }),
      });

      if (!response.ok) throw new Error('Failed to save configuration');

      setSaveMessage('✨ Perfect! Both the visual design and greeting have been saved.');
      speak('Excellent! Your complete branding setup is now live.');
      setShowGreetingPreview(false);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSaveMessage(errorMessage || 'Error saving configuration');
      speak('Sorry, I had trouble saving your changes.');
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  }, [clientId, config, generatedGreeting, speak]);

  // Process voice design commands
  const processVoiceDesignCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;

    const lowerCommand = command.toLowerCase();

    // Handle guided onboarding commands first
    if (showGuidedSetup) {
      // Casual affirmations
      const affirmations = ['sure', 'let\'s go', 'yeah', 'yep', 'ok', 'okay', 'that\'s the one', 'definitely', 'absolutely', 'sounds good', 'perfect'];
      if (affirmations.some(affirm => lowerCommand.includes(affirm)) || lowerCommand.includes('confirm') || lowerCommand.includes('yes') || lowerCommand.includes('apply')) {
        applySuggestedConfig();
        return;
      }
      
      // Casual redirections
      const redirections = ['someone else', 'go back', 'the other guy', 'different client', 'not this one', 'switch client'];
      if (redirections.some(redir => lowerCommand.includes(redir)) || lowerCommand.includes('another client') || lowerCommand.includes('switch')) {
        openClientSelector();
        return;
      }
      
      // Check for specific client name
      const mentionedClient = clients.find(client => 
        lowerCommand.includes(client.name.toLowerCase()) || 
        lowerCommand.includes(client.name.split(' ')[0]?.toLowerCase())
      );
      if (mentionedClient && mentionedClient.id !== clientId) {
        onClientChange(mentionedClient.id);
        speak(`Switching to ${mentionedClient.name}.`);
        return;
      }
      
      if (lowerCommand.includes('cancel') || lowerCommand.includes('no') || lowerCommand.includes('skip')) {
        // Clear silence timeout
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        
        setShowGuidedSetup(false);
        speak('No problem. You can use voice commands anytime to customize your design.');
        return;
      }
    }

    // Collaborative Listener - Full Design Pass commands
    const collaborativeCommands = [
      'do your thing', 'show me what you got', 'show me what you\'ve got', 
      'full pass', 'magic', 'work your magic', 'take over', 'handle it',
      'do your stuff', 'show me', 'impress me'
    ];
    
    if (collaborativeCommands.some(cmd => lowerCommand.includes(cmd))) {
      executeFullDesignPass();
      return;
    }

    // Service Catalog commands
    for (const capability of SERVICE_CATALOG) {
      if (capability.triggers.some(trigger => lowerCommand.includes(trigger))) {
        executeServiceCapability(capability);
        return;
      }
    }

    // Voice-Visual Harmony - Greeting approval commands
    if (showGreetingPreview) {
      const approvalCommands = ['i love it', 'love it', 'perfect', 'save that', 'save it', 'yes save', 'keep it'];
      if (approvalCommands.some(cmd => lowerCommand.includes(cmd))) {
        instantSave();
        return;
      }
      
      const rejectCommands = ['nope', 'try again', 'different', 'change it', 'not that'];
      if (rejectCommands.some(cmd => lowerCommand.includes(cmd))) {
        setShowGreetingPreview(false);
        speak('No problem. Let me generate a different greeting for you.');
        setTimeout(() => generateHarmoniousGreeting(), 2000);
        return;
      }
    }

    // Conversational Greeting Edit Commands
    const greetingEditCommands = ['change greeting', 'edit welcome message', 'update intro', 'modify greeting', 'edit intro'];
    if (greetingEditCommands.some(cmd => lowerCommand.includes(cmd))) {
      handleGreetingEditRequest();
      return;
    }

    // Handle greeting edit mode responses
    if (isEditingGreeting && greetingEditMode) {
      const suggestCommands = ['draft', 'suggest', 'create', 'generate', 'make one'];
      const dictateCommands = ['dictate', 'tell you', 'say it', 'speak', 'manual'];
      
      if (suggestCommands.some(cmd => lowerCommand.includes(cmd))) {
        setGreetingEditMode('suggest');
        handleDraftNewGreeting();
        return;
      }
      
      if (dictateCommands.some(cmd => lowerCommand.includes(cmd))) {
        setGreetingEditMode('dictate');
        handleDictateGreeting();
        return;
      }
    }

    // Handle dictated greeting capture
    if (isLongFormSTT && (lowerCommand.includes('stop') || lowerCommand.includes('done') || lowerCommand.includes('finish'))) {
      stopLongFormSTT();
      return;
    }

    try {
      const response = await fetch('/api/ai/voice-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, currentConfig: config }),
      });

      if (!response.ok) throw new Error('Failed to parse voice command');

      const data = await response.json();
      const { action, value, response: hannahResponse } = data.command;

      // Execute the design command
      switch (action) {
        case 'set_header_type':
          setConfig(prev => ({ ...prev, headerBackgroundType: value }));
          break;
        case 'set_header_color':
          setConfig(prev => ({ ...prev, headerBackground: value }));
          break;
        case 'set_header_gradient':
          setConfig(prev => ({ 
            ...prev, 
            headerGradientStart: value.start, 
            headerGradientEnd: value.end,
            headerBackgroundType: 'gradient'
          }));
          break;
        case 'set_header_image':
          setConfig(prev => ({ ...prev, headerImage: value, headerBackgroundType: 'image' }));
          break;
        case 'set_header_opacity':
          setConfig(prev => ({ ...prev, headerOpacity: value }));
          break;
        case 'set_footer_type':
          setConfig(prev => ({ ...prev, footerBackgroundType: value }));
          break;
        case 'set_footer_color':
          setConfig(prev => ({ ...prev, footerBackground: value }));
          break;
        case 'set_footer_gradient':
          setConfig(prev => ({ 
            ...prev, 
            footerGradientStart: value.start, 
            footerGradientEnd: value.end,
            footerBackgroundType: 'gradient'
          }));
          break;
        case 'set_footer_image':
          setConfig(prev => ({ ...prev, footerImage: value, footerBackgroundType: 'image' }));
          break;
        case 'set_footer_opacity':
          setConfig(prev => ({ ...prev, footerOpacity: value }));
          break;
        case 'apply_vibe':
          await applyAIVibe(value);
          break;
        case 'sync_brand':
          await syncBrandWithURL();
          break;
      }

      // Hannah speaks the confirmation
      speak(hannahResponse);
      setSaveMessage(`🎤 ${hannahResponse}`);
      
      // Clear transcript after processing
      setTimeout(() => setVoiceTranscript(''), 3000);
      
    } catch (err) {
      console.error('Voice command error:', err);
      speak("I didn't catch that. Please try again.");
    }
  }, [
    clientId,
    clients,
    config,
    executeFullDesignPass,
    executeServiceCapability,
    generateHarmoniousGreeting,
    greetingEditMode,
    handleDictateGreeting,
    handleDraftNewGreeting,
    handleGreetingEditRequest,
    instantSave,
    isEditingGreeting,
    isLongFormSTT,
    onClientChange,
    setGreetingEditMode,
    setSaveMessage,
    setShowGreetingPreview,
    setVoiceTranscript,
    showGreetingPreview,
    showGuidedSetup,
    speak,
    applyAIVibe,
    syncBrandWithURL,
    applySuggestedConfig,
    openClientSelector,
    stopLongFormSTT,
  ]);

  // Monitor clientId changes for tenant-switch vocal confirmation
  useEffect(() => {
    if (!clientId || clientId === previousClientId) return;

    const fetchAndConfirmClientSwitch = async () => {
      try {
        // Check for wrong turn flag from redirect
        const wrongTurn = sessionStorage.getItem('hannah_wrong_turn');
        const welcomeBack = sessionStorage.getItem('hannah_welcome_back');
        
        // Fetch new client data
        const response = await fetch(`/api/tenants/${clientId}`);
        if (!response.ok) return;
        
        const clientData = await response.json();
        const clientName = clientData.name || 'this client';
        const brandingRationale = clientData.branding_rationale || '';

        // Only announce if Hannah is awake
        if (isHannahAwake) {
          // Welcome back message for wrong turn
          if (welcomeBack === 'true') {
            setTimeout(() => {
              speak(`Welcome back! I see you took a wrong turn, but we're back on track now. Let's get to work with ${clientName}.`);
            }, 500);
            
            // Clear the flags
            sessionStorage.removeItem('hannah_wrong_turn');
            sessionStorage.removeItem('hannah_welcome_back');
          } else {
            // Normal tenant switch greeting
            speak(`I see you've selected ${clientName}. Let's get to work.`);
          }
          
          // If there's a branding rationale, mention it briefly (no second delay for wrong turn)
          if (brandingRationale && brandingRationale.length > 0) {
            const delay = welcomeBack === 'true' ? 1500 : 2000; // Faster for wrong turn
            setTimeout(() => {
              speak(`Their brand focus: ${brandingRationale.substring(0, 100)}${brandingRationale.length > 100 ? '...' : ''}`);
            }, delay);
          }
        }
        
        setPreviousClientId(clientId);
        console.log(`OVG-PLATFORM-V2: Tenant switch confirmed to ${clientName}${wrongTurn ? ' (with wrong turn correction)' : ''}`);
        
      } catch (err) {
        console.error('Error fetching client data for tenant switch:', err);
      }
    };

    fetchAndConfirmClientSwitch();
  }, [clientId, previousClientId, isHannahAwake, speak]);

  // Handle initial load from redirect with immediate branding sync
  useEffect(() => {
    const welcomeBack = sessionStorage.getItem('hannah_welcome_back');
    const wrongTurn = sessionStorage.getItem('hannah_wrong_turn');
    
    if (welcomeBack === 'true' && wrongTurn === 'true' && clientId) {
      // Force immediate branding sync for redirect scenario
      const fetchClientForRedirect = async () => {
        try {
          const response = await fetch(`/api/tenants/${clientId}`);
          if (response.ok) {
            const clientData = await response.json();
            console.log(`OVG-PLATFORM-V2: Immediate branding sync for ${clientData.name} after redirect`);
          }
        } catch (err) {
          console.error('Error in immediate branding sync:', err);
        }
      };
      
      fetchClientForRedirect();
    }
  }, [clientId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel: The Studio */}
      <div className="space-y-6">
        {/* Client Switcher Header */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-[#FFD700]">◆</span>
              Studio Controls
            </h2>
            <div className="flex items-center gap-3">
              {_isLoadingConfig && (
                <div className="text-xs text-white/60">Loading...</div>
              )}
              {/* Voice Command Mic Button */}
              <button
                onClick={() => {
                  if (isListening) {
                    stopListening();
                    setForcedContinuousMode(false);
                  } else {
                    setForcedContinuousMode(true);
                    startListening();
                  }
                }}
                className={`relative p-3 rounded-full transition-all ${
                  (isListening || forcedContinuousMode) 
                    ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/50' 
                    : 'bg-[#0097b2] hover:bg-[#0086a3]'
                }`}
                title={
                  forcedContinuousMode 
                    ? 'Forced continuous mode - Click to stop' 
                    : (isListening ? 'Stop listening' : 'Start voice command (forced continuous)')
                }
              >
                <svg 
                  className="w-5 h-5 text-white" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  {isListening ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  )}
                </svg>
                {/* Recording indicator ring */}
                {(isListening || forcedContinuousMode) && (
                  <span className={`absolute inset-0 rounded-full animate-ping ${
                    forcedContinuousMode ? 'bg-blue-400' : 'bg-red-400'
                  } opacity-30`} />
                )}
              </button>
              
              {/* Hannah Sleep/Wake Indicator */}
              {!isHannahAwake && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-600/20 border border-gray-500/30 rounded-full">
                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                  <span className="text-xs text-gray-400">Hannah sleeping</span>
                </div>
              )}
            </div>
          </div>

          {/* Client Switcher Dropdown */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-white/60 uppercase tracking-wider">Select Client:</label>
            <select
              value={clientId}
              onChange={(e) => onClientChange(e.target.value)}
              className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-sm text-white focus:border-[#0097b2] outline-none"
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">

          {/* Header Background */}
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Header Background</h3>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => updateConfig('headerBackgroundType', 'solid')}
                className={`px-3 py-1.5 text-xs rounded transition-all ${
                  config.headerBackgroundType === 'solid'
                    ? 'bg-[#0097b2] text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Solid
              </button>
              <button
                onClick={() => updateConfig('headerBackgroundType', 'gradient')}
                className={`px-3 py-1.5 text-xs rounded transition-all ${
                  config.headerBackgroundType === 'gradient'
                    ? 'bg-[#0097b2] text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Gradient
              </button>
              <button
                onClick={() => updateConfig('headerBackgroundType', 'image')}
                className={`px-3 py-1.5 text-xs rounded transition-all ${
                  config.headerBackgroundType === 'image'
                    ? 'bg-[#0097b2] text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Image
              </button>
            </div>

            {config.headerBackgroundType === 'solid' ? (
              <div className="flex items-center gap-3">
                <ColorPicker
                  label="Header Color"
                  value={config.headerBackground}
                  onChange={(color) => updateConfig('headerBackground', color)}
                />
                <input
                  type="text"
                  value={config.headerBackground}
                  onChange={(e) => updateConfig('headerBackground', e.target.value)}
                  className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
                  placeholder="#0097b2"
                />
              </div>
            ) : config.headerBackgroundType === 'gradient' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <ColorPicker
                    label="Gradient Start"
                    value={config.headerGradientStart}
                    onChange={(color) => updateConfig('headerGradientStart', color)}
                  />
                  <input
                    type="text"
                    value={config.headerGradientStart}
                    onChange={(e) => updateConfig('headerGradientStart', e.target.value)}
                    className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
                    placeholder="Start color"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <ColorPicker
                    label="Gradient End"
                    value={config.headerGradientEnd}
                    onChange={(color) => updateConfig('headerGradientEnd', color)}
                  />
                  <input
                    type="text"
                    value={config.headerGradientEnd}
                    onChange={(e) => updateConfig('headerGradientEnd', e.target.value)}
                    className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
                    placeholder="End color"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60 uppercase tracking-wider">Background Opacity</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(config.headerOpacity * 100)}
                      onChange={(e) => updateConfig('headerOpacity', parseInt(e.target.value) / 100)}
                      className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#0097b2]"
                    />
                    <span className="text-xs text-white/80 w-12 text-right">{Math.round(config.headerOpacity * 100)}%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={config.headerImage}
                    onChange={(e) => updateConfig('headerImage', e.target.value)}
                    className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
                    placeholder="https://example.com/header-image.jpg"
                  />
                  <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded transition-all">
                    Upload
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60 uppercase tracking-wider">Background Opacity</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(config.headerOpacity * 100)}
                      onChange={(e) => updateConfig('headerOpacity', parseInt(e.target.value) / 100)}
                      className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#0097b2]"
                    />
                    <span className="text-xs text-white/80 w-12 text-right">{Math.round(config.headerOpacity * 100)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Background */}
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Footer Background</h3>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => updateConfig('footerBackgroundType', 'solid')}
                className={`px-3 py-1.5 text-xs rounded transition-all ${
                  config.footerBackgroundType === 'solid'
                    ? 'bg-[#0097b2] text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Solid
              </button>
              <button
                onClick={() => updateConfig('footerBackgroundType', 'gradient')}
                className={`px-3 py-1.5 text-xs rounded transition-all ${
                  config.footerBackgroundType === 'gradient'
                    ? 'bg-[#0097b2] text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Gradient
              </button>
              <button
                onClick={() => updateConfig('footerBackgroundType', 'image')}
                className={`px-3 py-1.5 text-xs rounded transition-all ${
                  config.footerBackgroundType === 'image'
                    ? 'bg-[#0097b2] text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Image
              </button>
            </div>

            {config.footerBackgroundType === 'solid' ? (
              <div className="flex items-center gap-3">
                <ColorPicker
                  label="Footer Color"
                  value={config.footerBackground}
                  onChange={(color) => updateConfig('footerBackground', color)}
                />
                <input
                  type="text"
                  value={config.footerBackground}
                  onChange={(e) => updateConfig('footerBackground', e.target.value)}
                  className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
                  placeholder="#050a14"
                />
              </div>
            ) : config.footerBackgroundType === 'gradient' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <ColorPicker
                    label="Gradient Start"
                    value={config.footerGradientStart}
                    onChange={(color) => updateConfig('footerGradientStart', color)}
                  />
                  <input
                    type="text"
                    value={config.footerGradientStart}
                    onChange={(e) => updateConfig('footerGradientStart', e.target.value)}
                    className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
                    placeholder="Start color"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <ColorPicker
                    label="Gradient End"
                    value={config.footerGradientEnd}
                    onChange={(color) => updateConfig('footerGradientEnd', color)}
                  />
                  <input
                    type="text"
                    value={config.footerGradientEnd}
                    onChange={(e) => updateConfig('footerGradientEnd', e.target.value)}
                    className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
                    placeholder="End color"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60 uppercase tracking-wider">Background Opacity</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(config.footerOpacity * 100)}
                      onChange={(e) => updateConfig('footerOpacity', parseInt(e.target.value) / 100)}
                      className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#0097b2]"
                    />
                    <span className="text-xs text-white/80 w-12 text-right">{Math.round(config.footerOpacity * 100)}%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={config.footerImage}
                    onChange={(e) => updateConfig('footerImage', e.target.value)}
                    className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
                    placeholder="https://example.com/footer-image.jpg"
                  />
                  <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded transition-all">
                    Upload
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60 uppercase tracking-wider">Background Opacity</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(config.footerOpacity * 100)}
                      onChange={(e) => updateConfig('footerOpacity', parseInt(e.target.value) / 100)}
                      className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#0097b2]"
                    />
                    <span className="text-xs text-white/80 w-12 text-right">{Math.round(config.footerOpacity * 100)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Logo Upload */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Logo</h3>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={config.logoUrl}
                onChange={(e) => updateConfig('logoUrl', e.target.value)}
                className="flex-1 bg-black/30 border border-white/20 rounded px-3 py-2 text-xs text-white focus:border-[#0097b2] outline-none"
                placeholder="Logo URL"
              />
              <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded transition-all">
                Upload
              </button>
            </div>
          </div>
        </div>

        {/* The Switchboard */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <span className="text-[#FFD700]">◆</span>
            AI Add-ons
          </h2>

          <div className="space-y-4">
            {/* AI Insight Badge */}
            <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
              <div className="flex items-center gap-3">
                {isFeatureLocked('aiInsightBadge') && (
                  <span className="text-[#FFD700] text-lg">🔒</span>
                )}
                <div>
                  <div className="text-sm text-white font-medium">AI Insight Badge</div>
                  <div className="text-xs text-white/50">Display AI-powered insights</div>
                </div>
              </div>
              <button
                onClick={() => updateConfig('aiInsightBadge', !config.aiInsightBadge)}
                disabled={isFeatureLocked('aiInsightBadge')}
                className={`w-12 h-6 rounded-full transition-all relative ${
                  config.aiInsightBadge ? 'bg-[#0097b2]' : 'bg-white/20'
                } ${isFeatureLocked('aiInsightBadge') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                    config.aiInsightBadge ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* AI Design Mirror */}
            <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
              <div className="flex items-center gap-3">
                {isFeatureLocked('aiDesignMirror') && (
                  <span className="text-[#FFD700] text-lg">🔒</span>
                )}
                <div>
                  <div className="text-sm text-white font-medium">AI Design Mirror</div>
                  <div className="text-xs text-white/50">Auto-scrape and mirror design</div>
                </div>
              </div>
              <button
                onClick={() => updateConfig('aiDesignMirror', !config.aiDesignMirror)}
                disabled={isFeatureLocked('aiDesignMirror')}
                className={`w-12 h-6 rounded-full transition-all relative ${
                  config.aiDesignMirror ? 'bg-[#0097b2]' : 'bg-white/20'
                } ${isFeatureLocked('aiDesignMirror') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                    config.aiDesignMirror ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Custom CSS */}
            <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
              <div className="flex items-center gap-3">
                {isFeatureLocked('customCss') && (
                  <span className="text-[#FFD700] text-lg">🔒</span>
                )}
                <div>
                  <div className="text-sm text-white font-medium">Custom CSS</div>
                  <div className="text-xs text-white/50">Inject custom styles</div>
                </div>
              </div>
              <button
                onClick={() => updateConfig('customCss', !config.customCss)}
                disabled={isFeatureLocked('customCss')}
                className={`w-12 h-6 rounded-full transition-all relative ${
                  config.customCss ? 'bg-[#0097b2]' : 'bg-white/20'
                } ${isFeatureLocked('customCss') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                    config.customCss ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {isFeatureLocked('standard') && (
            <div className="mt-4 p-3 bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-lg">
              <div className="flex items-center gap-2 text-[#FFD700] text-xs">
                <span>🔒</span>
                <span>Upgrade to Premium to unlock all AI features</span>
              </div>
            </div>
          )}
        </div>

        {/* AI Vibe Generator */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="text-[#FFD700]">✨</span>
            AI Vibe Generator
          </h2>
          <p className="text-white/60 text-sm mb-4">
            Describe your desired aesthetic and let AI generate the perfect branding.
          </p>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={vibeInput}
                onChange={(e) => setVibeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && vibeInput && applyAIVibe(vibeInput)}
                placeholder="e.g., 'cyberpunk neon', 'minimalist luxury', 'playful and bright'"
                className="flex-1 bg-black/30 border border-white/20 rounded-lg px-4 py-3 text-sm text-white focus:border-[#FFD700] outline-none"
                disabled={isAiSyncing}
              />
              <button
                onClick={() => vibeInput && applyAIVibe(vibeInput)}
                disabled={isAiSyncing || !vibeInput}
                className="px-6 py-3 bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFC700] hover:to-[#FF9500] text-black font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAiSyncing ? 'Generating...' : 'Apply Vibe'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Cyberpunk Neon', 'Minimalist', 'Luxury Gold', 'Ocean Blue', 'Sunset Warmth', 'Forest Green'].map((vibe) => (
                <button
                  key={vibe}
                  onClick={() => applyAIVibe(vibe)}
                  disabled={isAiSyncing}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 text-xs rounded-full transition-all disabled:opacity-50"
                >
                  {vibe}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 bg-[#0097b2] hover:bg-[#0086a3] text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button
            onClick={syncBrandWithURL}
            disabled={isAiSyncing}
            className="px-6 py-3 bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFC700] hover:to-[#FF9500] text-black font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span>{isAiSyncing ? '✨ Syncing...' : '✨ AI Magic'}</span>
          </button>
          {saveMessage && (
            <span className={`text-sm ${saveMessage.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {saveMessage}
            </span>
          )}
        </div>

        {/* Voice-Visual Harmony - Greeting Preview */}
        {showGreetingPreview && (
          <div className="backdrop-blur-xl bg-white/10 border border-[#FFD700]/30 rounded-xl p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-[#FFD700]">◆</span>
                  Voice-Visual Harmony
                </h3>
                <button
                  onClick={() => setShowGreetingPreview(false)}
                  className="text-white/60 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-3">
                <div className="text-white/80 text-sm">
                  <span className="text-[#FFD700]">Generated Greeting:</span>
                </div>
                <div className="backdrop-blur-lg bg-black/40 rounded-lg p-4 border border-white/10">
                  <p className="text-white text-sm italic">&quot;{generatedGreeting}&quot;</p>
                </div>
                
                {greetingExplanation && (
                  <div className="text-white/60 text-xs">
                    <span className="text-[#FFD700]">Design Rationale:</span> {greetingExplanation}
                  </div>
                )}
                
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={instantSave}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFC700] hover:to-[#FF9500] text-black font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isSaving ? 'Saving...' : "I love it! ✓"}
                  </button>
                  <button
                    onClick={() => {
                      setShowGreetingPreview(false);
                      speak('No problem. Let me generate a different greeting for you.');
                      setTimeout(() => generateHarmoniousGreeting(), 2000);
                    }}
                    className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-all text-sm"
                  >
                    Try Again
                  </button>
                </div>
                
                <div className="text-white/40 text-xs text-center">
                  Say &quot;I love it&quot; or &quot;Save that&quot; to approve, or &quot;Try again&quot; to regenerate
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Long-Form STT Mode Indicator */}
        {isLongFormSTT && (
          <div className="backdrop-blur-xl bg-red-500/20 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <div className="text-white">
                <div className="font-semibold text-sm">🎤 Dictating Greeting</div>
                <div className="text-xs text-white/70">Say &quot;stop&quot; or &quot;done&quot; when finished</div>
                {dictatedGreeting && (
                  <div className="mt-2 text-xs text-white/60 italic">
                    &quot;{dictatedGreeting}&quot;
                  </div>
                )}
              </div>
              <button
                onClick={stopLongFormSTT}
                className="ml-auto px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded-full transition-all"
              >
                Stop
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: Live Preview */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-[#FFD700]">◆</span>
            Live Preview
          </h2>
          {/* Speaker Toggle */}
          <button
            onClick={() => setIsSpeakerEnabled(!isSpeakerEnabled)}
            className={`p-2 rounded-lg transition-all ${
              isSpeakerEnabled 
                ? 'bg-[#0097b2]/20 text-[#0097b2]' 
                : 'bg-white/10 text-white/40'
            }`}
            title={isSpeakerEnabled ? 'Mute Hannah' : 'Unmute Hannah'}
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              {isSpeakerEnabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M16 12l6-6m0 0l-6 6m6-6l6 6" />
              )}
            </svg>
          </button>
        </div>

        <div className="relative rounded-lg overflow-hidden" style={{ height: '500px' }}>
          {/* Widget Preview */}
          <div className="absolute inset-0 flex flex-col">
            {/* Header */}
            <div
              className="p-4 flex items-center gap-3 relative backdrop-blur-lg"
              style={{
                background: config.headerBackgroundType === 'image' && config.headerImage?.startsWith('http')
                  ? `url(${config.headerImage}) center/cover no-repeat` 
                  : getHeaderBackground(),
                opacity: config.headerBackgroundType !== 'solid' ? config.headerOpacity : 1,
              }}
            >
              {config.headerBackgroundType === 'image' && (
                <div 
                  className="absolute inset-0" 
                  style={{ backgroundColor: `rgba(0, 0, 0, ${1 - config.headerOpacity})` }}
                />
              )}
              <div className="relative z-10 flex items-center gap-3">
                {config.logoUrl && config.logoUrl.startsWith('http') ? (
                  <div className="relative w-8 h-8 rounded overflow-hidden">
                    <Image
                      src={config.logoUrl}
                      alt="Logo"
                      fill
                      className="rounded"
                      style={{ objectFit: 'cover' }}
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                    AI
                  </div>
                )}
                <div className="text-white font-semibold text-sm drop-shadow-md">Chat Widget</div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 backdrop-blur-lg bg-opacity-40 bg-black/30 p-4">
              <div className="space-y-3">
                <div className="flex justify-end">
                  <div className="bg-[#0097b2] text-white px-4 py-2 rounded-lg max-w-[80%] text-sm">
                    Hello! How can I help you today?
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-white/20 text-white px-4 py-2 rounded-lg max-w-[80%] text-sm">
                    I have a question about your services.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              className="p-3 relative backdrop-blur-lg"
              style={{
                background: config.footerBackgroundType === 'image' && config.footerImage?.startsWith('http')
                  ? `url(${config.footerImage}) center/cover no-repeat` 
                  : getFooterBackground(),
                opacity: config.footerBackgroundType !== 'solid' ? config.footerOpacity : 1,
              }}
            >
              {config.footerBackgroundType === 'image' && (
                <div 
                  className="absolute inset-0" 
                  style={{ backgroundColor: `rgba(0, 0, 0, ${1 - config.footerOpacity})` }}
                />
              )}
              <div className="relative z-10 text-white/60 text-xs text-center drop-shadow-md">
                Powered by OVG Platform
              </div>
            </div>
          </div>
        </div>

        {/* Guided Onboarding Overlay */}
        {showGuidedSetup && (
          <div className="absolute inset-0 backdrop-blur-xl bg-black/80 flex items-center justify-center z-50">
            <div className="backdrop-blur-xl bg-white/10 border border-[#FFD700]/30 rounded-2xl p-8 max-w-md w-full mx-4">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-[#FFD700] to-[#FFA500] flex items-center justify-center">
                    <svg className="w-8 h-8 text-black" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">AI Branding Suggestion</h3>
                  <p className="text-white/80 text-sm">
                    I&apos;ve prepared a professional branding theme for your client. Would you like to apply it?
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={applySuggestedConfig}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFC700] hover:to-[#FF9500] text-black font-semibold rounded-lg transition-all"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={openClientSelector}
                    className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-all"
                  >
                    Another Client
                  </button>
                </div>
                <button
                  onClick={() => setShowGuidedSetup(false)}
                  className="w-full px-4 py-2 text-white/60 hover:text-white text-sm transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transcribing Overlay */}
        {(isListening || isProcessing || voiceTranscript) && (
          <div className="absolute bottom-4 left-4 right-4 backdrop-blur-xl bg-black/60 border border-[#FFD700]/30 rounded-xl p-4 z-50">
            <div className="flex items-center gap-3">
              {isListening && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-white/80 text-sm font-medium">
                    {showGuidedSetup ? 'Listening for your response...' : 'Listening...'}
                  </span>
                </div>
              )}
              {isProcessing && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#0097b2] border-t-transparent rounded-full animate-spin" />
                  <span className="text-white/80 text-sm font-medium">Processing...</span>
                </div>
              )}
            </div>
            {voiceTranscript && (
              <div className="mt-2 text-white text-sm">
                <span className="text-[#FFD700]">You said:</span> &quot;{voiceTranscript}&quot;
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
