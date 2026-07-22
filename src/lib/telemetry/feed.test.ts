// src/lib/telemetry/feed.test.ts
//
// Pure unit coverage for the live telemetry feed normalizers + merger.
// No Supabase / React — these are deterministic transforms over row shapes.

import { describe, it, expect } from 'vitest';
import {
  deriveActionScope,
  normalizeActionLog,
  normalizeChatMessage,
  parseChatMessageContent,
  mergeFeedEntries,
  formatFeedTimestamp,
  type ActionLogRow,
  type ChatMessageRow,
} from './feed';

const TS_OLD = '2026-07-15T10:00:00.000Z';
const TS_NEW = '2026-07-15T10:05:00.000Z';

function makeAction(overrides: Partial<ActionLogRow> = {}): ActionLogRow {
  return {
    action_id: 'SYSTEM_UPDATE_BRANDING',
    tenant_id: 't1',
    source: 'manual',
    params: {},
    created_at: TS_OLD,
    success: true,
    ...overrides,
  };
}

function makeChat(overrides: Partial<ChatMessageRow> = {}): ChatMessageRow {
  return {
    id: 'c1',
    tenant_id: 't1',
    message: JSON.stringify({
      user: 'Hello',
      assistant: { actionType: 'SYSTEM_UPDATE_BRANDING', summary: 'Hi there!', surface: 'client' },
    }),
    created_at: TS_NEW,
    ...overrides,
  };
}

describe('parseChatMessageContent', () => {
  it('parses the JSON-encoded user/assistant pair', () => {
    const result = parseChatMessageContent(
      JSON.stringify({
        user: 'Book a demo',
        assistant: { actionType: 'SYSTEM_UPDATE_BRANDING', summary: 'On it!', surface: 'client' },
      }),
    );
    expect(result).toEqual({ user: 'Book a demo', ai: 'On it!', surface: 'client' });
  });

  it('falls back to the raw text when content is not JSON', () => {
    expect(parseChatMessageContent('just a string')).toEqual({ user: 'just a string', ai: '' });
  });
});

describe('deriveActionScope', () => {
  it('prefers the params.surface tag when present', () => {
    expect(deriveActionScope(makeAction({ params: { surface: 'reseller' } }))).toBe('reseller');
    expect(deriveActionScope(makeAction({ params: { surface: 'client' } }))).toBe('client');
  });

  it('falls back to the source column', () => {
    expect(deriveActionScope(makeAction({ params: {}, source: 'reseller' }))).toBe('reseller');
    expect(deriveActionScope(makeAction({ params: {}, source: 'client' }))).toBe('client');
    expect(deriveActionScope(makeAction({ params: {}, source: 'infrastructure' }))).toBe('client');
  });

  it('resolves reseller-scoped SYSTEM commands via the registry', () => {
    expect(deriveActionScope(makeAction({ action_id: 'DELETE_CLIENT', params: {}, source: 'manual' }))).toBe('reseller');
  });

  it('defaults to client for unknown sources', () => {
    expect(deriveActionScope(makeAction({ params: {}, source: 'hannah' }))).toBe('client');
  });
});

describe('normalizeActionLog', () => {
  it('produces an action feed entry with scope + success', () => {
    const entry = normalizeActionLog(makeAction({ action_id: 'VOICE_COMMAND', success: false }));
    expect(entry.kind).toBe('action');
    expect(entry.actionType).toBe('VOICE_COMMAND');
    expect(entry.success).toBe(false);
    expect(entry.scope).toBe('client');
  });
});

describe('normalizeChatMessage', () => {
  it('produces a conversation feed entry with parsed pair', () => {
    const entry = normalizeChatMessage(makeChat());
    expect(entry.kind).toBe('conversation');
    expect(entry.conversation?.user).toBe('Hello');
    expect(entry.conversation?.ai).toBe('Hi there!');
    expect(entry.scope).toBe('client');
  });

  it('honors a reseller surface inside the assistant payload', () => {
    const entry = normalizeChatMessage(
      makeChat({
        message: JSON.stringify({
          user: 'u',
          assistant: { actionType: 'X', summary: 'a', surface: 'reseller' },
        }),
      }),
    );
    expect(entry.scope).toBe('reseller');
  });
});

describe('mergeFeedEntries', () => {
  it('sorts newest-first and interleaves both sources', () => {
    const merged = mergeFeedEntries(
      [makeAction({ created_at: TS_OLD })],
      [makeChat({ created_at: TS_NEW })],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0].createdAt).toBe(TS_NEW);
    expect(merged[0].kind).toBe('conversation');
    expect(merged[1].kind).toBe('action');
  });

  it('respects the limit cap', () => {
    const actions = Array.from({ length: 5 }, (_, i) =>
      makeAction({ action_id: `A${i}`, created_at: new Date(Date.now() - i * 1000).toISOString() }),
    );
    const merged = mergeFeedEntries(actions, [], 3);
    expect(merged).toHaveLength(3);
  });
});

describe('formatFeedTimestamp', () => {
  it('returns the raw value for invalid timestamps', () => {
    expect(formatFeedTimestamp('not-a-date')).toBe('not-a-date');
  });

  it('labels very recent timestamps as now', () => {
    const now = new Date().toISOString();
    expect(formatFeedTimestamp(now)).toContain('now');
  });
});
