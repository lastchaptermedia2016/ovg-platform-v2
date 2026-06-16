# Page-Level Command Capabilities Integration Plan

## Overview
Inject contextual command registration into page components so Hannah's command deck displays page-appropriate capabilities.

## Target Pages

### 1. Clients Dashboard (`src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx`)
Register on mount:
- Delete client [name]
- Filter clients by [sector]
- Reset signals for [client]
- Show me [industry] clients

### 2. Branding Studio (`src/app/(dashboard)/reseller/[resellerSlug]/branding/page.tsx`)
Register on mount:
- Apply [vibe] archetype
- Synchronize asset buffers
- Toggle welcome greeting lock

## Implementation Strategy

### Pattern: useEffect Hook Registration

```tsx
// At top of page component
import { useHannah } from '@/contexts/HannahContext';
import type { CommandCapability } from '@/core/ai/system-capabilities';

export default function ClientsPage() {
  const { setActiveCommands, setCommandDeckOpen } = useHannah();

  useEffect(() => {
    // Register clients-specific capabilities on mount
    const clientsCapabilities: CommandCapability[] = [
      {
        key: 'DELETE_CLIENT',
        name: 'Delete client [name]',
        description: 'Removes a client tenant from your portfolio',
        examples: ['Delete BMW Test', 'Remove client John Doe Motors']
      },
      {
        key: 'SYSTEM_FILTER_GRID',
        name: 'Filter clients by [sector]',
        description: 'Filters the client grid to show only clients in a specific industry sector',
        examples: ['Filter by automotive', 'Show only retail clients']
      },
      // ... additional commands
    ];
    
    setActiveCommands(clientsCapabilities);

    // Cleanup on unmount
    return () => {
      setActiveCommands([]);
    };
  }, [setActiveCommands]);
```

## Files to Modify

1. **src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx**
   - Add useEffect hook after existing hooks (around line 62)
   - Register clients dashboard capabilities
   - Cleanup on unmount

2. **src/app/(dashboard)/reseller/[resellerSlug]/branding/page.tsx**
   - Add import for useHannah and CommandCapability
   - Add useEffect hook after client fetch effect
   - Register branding studio capabilities
   - Cleanup on unmount

## Command Definitions

### Clients Dashboard Commands
- `Delete client [name]` — Maps to DELETE_CLIENT action
- `Filter clients by [sector]` — Maps to SYSTEM_FILTER_GRID action
- `Reset signals for [client]` — Maps to signal reset functionality
- `Show me [industry] clients` — Maps to SYSTEM_FILTER_GRID

### Branding Studio Commands
- `Apply [vibe] archetype` — Maps to SYSTEM_UPDATE_BRANDING
- `Synchronize asset buffers` — Maps to asset sync functionality
- `Toggle welcome greeting lock` — Maps to greeting configuration