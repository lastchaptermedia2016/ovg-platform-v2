export const resolveHeadersConstructor = (): typeof Headers | undefined => {
  if (typeof Headers !== 'undefined') return Headers;
  if (typeof globalThis !== 'undefined' && 'Headers' in globalThis) {
    return globalThis.Headers as unknown as typeof Headers;
  }
  return undefined;
}
