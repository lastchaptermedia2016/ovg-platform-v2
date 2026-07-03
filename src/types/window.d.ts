export {};

declare global {
  interface Window {
    __ZEEDER_DEBUG_PROFILE__: ZeederClientProfile | null;
  }
}