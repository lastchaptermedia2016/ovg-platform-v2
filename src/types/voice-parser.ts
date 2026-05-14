/**
 * Universal Voice Entry — Parser Types
 *
 * Strict interfaces for the deterministic STT-to-CRM parser.
 * No runtime dependencies; pure TypeScript types only.
 */

/**
 * The three-tier category system used for capability gating.
 * - AUTOMOTIVE_ELITE: Full ai/sms/vin/signal module access
 * - RETAIL_STANDARD:  ai/sms/signal (VIN locked out)
 * - GENERAL:          ai/sms/signal (fallback tier)
 */
export type VoiceParseCategory = 'AUTOMOTIVE_ELITE' | 'RETAIL_STANDARD' | 'GENERAL';

/**
 * Result returned by parseVoiceEntry() — the contract between
 * raw STT transcription and the CRM client insertion form.
 */
export interface VoiceParseResult {
  /** Extracted client/business name. Never empty on success. */
  name: string;

  /** Raw industry string as spoken (or extracted via heuristic). */
  industry: string;

  /** Mapped category for capability routing. */
  category: VoiceParseCategory;

  /** Diagnostic metadata for observability & tuning. */
  meta: {
    /** True if the raw text contained explicit delimiters (| , ;). */
    parserFoundDelimiters: boolean;

    /**
     * Confidence score 0.0–1.0:
     *   1.0 = delimiter parse + industry matched
     *   0.8 = delimiter parse + industry defaulted
     *   0.5 = regex pattern match
     *   0.3 = regex match + industry defaulted
     *   0.1 = full-string fallback (conversational noise)
     */
    confidence: number;
  };
}