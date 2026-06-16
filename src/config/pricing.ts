// ──────────────────────────────────────────────
// Master Pricing Configuration — South African ZAR
// All values in South African Rand (ZAR)
// ──────────────────────────────────────────────

// ── Types ─────────────────────────────────────

/** Wholesale cost vs. suggested retail for a plan tier */
export interface PlanTierCost {
  wholesaleCost: number;
  suggestedRetail: number;
}

/** Wholesale and retail pricing for a single add-on feature */
export interface AddOnCost {
  wholesale: number;
  retail: number;
}

/**
 * Minimal tenant record shape accepted by the profit-split aggregator.
 * Mirrors the columns selected by the server-component query so callers
 * can pass `TenantLedgerRow` objects directly without reshaping.
 */
export interface TenantPricingInput {
  mrr: string | null;
  revenue_total: string | null;
  plan_tier: string | null;
}

/** Aggregated financial summary returned by `calculateResellerSplits` */
export interface ResellerSplitsSummary {
  /** Sum of all tenant MRR values (gross, pre-wholesale) */
  totalGrossMrr: number;
  /** Sum of wholesale costs for all tenants (based on plan_tier lookup) */
  totalWholesaleCost: number;
  /**
   * Net reseller profit after 50/50 split and safeguard rule:
   * Sum of (mrr - wholesaleCost) per tenant, floored at 0.
   */
  totalResellerTakeHome: number;
}

// ── Plan Tier Maps ────────────────────────────

export const PLAN_TIER_COSTS: Record<string, PlanTierCost> = {
  standard:   { wholesaleCost: 950,  suggestedRetail: 2450 },
  premium:    { wholesaleCost: 1850, suggestedRetail: 4950 },
  enterprise: { wholesaleCost: 3850, suggestedRetail: 9950 },
};

/** Fallback cost for unrecognised or null plan tiers — zero cost, zero retail */
export const FALLBACK_TIER_COST: PlanTierCost = {
  wholesaleCost: 0,
  suggestedRetail: 0,
};

// ── Add-On Feature Cost Maps ──────────────────

export const ADDON_COSTS = {
  /** WhatsApp Core Link — maps to `indicators.sms` JSONB key */
  whatsapp: { wholesale: 350, retail: 850 },
  /** Extra Active Voice Seats — per-seat monthly cost */
  extraVoiceSeats: { wholesale: 200, retail: 500 },
  /** High-Volume Signals Pack — maps to `indicators.signal` JSONB key */
  highVolumeSignals: { wholesale: 150, retail: 450 },
} as const satisfies Record<string, AddOnCost>;

// ── 50/50 Profit Split Aggregator ─────────────

/**
 * Loop through tenant financial records and compute the reseller's
 * net take-home under the 50/50 profit-sharing model.
 *
 * **Safeguard Rule:**
 * If a tenant's parsed MRR is less than or equal to the wholesale cost
 * of their plan tier, that tenant contributes `0` to `totalResellerTakeHome`.
 * This prevents legacy trials, unactivated slots, or below-cost accounts
 * from dragging down the reseller's net position.
 *
 * @param tenants — Array of tenant pricing inputs (nullable strings accepted).
 * @returns Aggregated `ResellerSplitsSummary` with gross, wholesale, and net.
 */
export function calculateResellerSplits(
  tenants: TenantPricingInput[],
): ResellerSplitsSummary {
  let totalGrossMrr = 0;
  let totalWholesaleCost = 0;
  let totalResellerTakeHome = 0;

  for (const tenant of tenants) {
    // Parse MRR — null/undefined/non-numeric defaults to 0
    const mrr = parseFloat(tenant.mrr ?? "0");
    if (Number.isNaN(mrr)) continue;

    // Look up plan tier cost; fall back to zero-cost if unrecognised
    const tier = PLAN_TIER_COSTS[tenant.plan_tier ?? ""] ?? FALLBACK_TIER_COST;

    totalGrossMrr += mrr;
    totalWholesaleCost += tier.wholesaleCost;

    // ── Safeguard Rule ──────────────────────
    // If MRR ≤ wholesale cost, reseller nets 0 from this tenant.
    // This prevents negative balance leakage.
    if (mrr > tier.wholesaleCost) {
      totalResellerTakeHome += mrr - tier.wholesaleCost;
    }
    // else: contribution is 0 — no-op
  }

  return {
    totalGrossMrr,
    totalWholesaleCost,
    totalResellerTakeHome,
  };
}