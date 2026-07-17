import type { CSSProperties } from 'react';

export type WidgetPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left';

/**
 * Resolve a widget corner placement to fixed-position CSS insets.
 * Centralizes the four supported positions so the launcher bubble,
 * the open chat window, and the presence pill all render consistently.
 */
export function cornerStyle(position?: WidgetPosition | null): CSSProperties {
  const base: CSSProperties = { position: 'fixed' };
  switch (position) {
    case 'top-left':
      return { ...base, top: '1.5rem', left: '1rem' };
    case 'top-right':
      return { ...base, top: '1.5rem', right: '1rem' };
    case 'bottom-left':
      return { ...base, bottom: '1.5rem', left: '1rem' };
    case 'bottom-right':
    default:
      return { ...base, bottom: '1.5rem', right: '1rem' };
  }
}
