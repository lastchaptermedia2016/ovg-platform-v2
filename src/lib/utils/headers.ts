export const resolveHeadersConstructor = () => {
  if (typeof Headers !== 'undefined') return Headers;
  return (globalThis as any).Headers;
}
