export function formatMessageContent(raw: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return raw;

  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return raw;

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return raw;

    if (typeof parsed.assistant?.summary === 'string' && parsed.assistant.summary.trim()) {
      return parsed.assistant.summary.trim();
    }
    if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
      return parsed.summary.trim();
    }
  } catch {
    // not JSON — fall through to raw text
  }

  return raw;
}
