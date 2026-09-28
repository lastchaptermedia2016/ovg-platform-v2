/**
 * Phase 4.1 — Post-Creation Provisioning: Industry Knowledge Seeding
 *
 * Provides a modular, lookup-table-driven seeding of base knowledge/Q&A
 * entries into `tenant_knowledge` for newly created tenants, so the AI
 * concierge has industry-relevant context from the very first conversation.
 *
 * Design contract:
 *   - Pure lookup/row-building logic is separated from the DB write.
 *   - Unknown or oddly formatted industry keys normalize safely to the
 *     'general' fallback bucket — this module never throws for bad input.
 *   - The DB write resolves with `{ seeded, error }` instead of throwing for
 *     Postgrest failures; the CALLER still wraps the whole call in its own
 *     try/catch (see create-client/route.ts) so seeding can NEVER block or
 *     roll back the primary tenant-creation response.
 *
 * Note on typing: the phase spec suggested `supabaseClient: any`; per the
 * workspace rule "avoid 'any' at all costs" the parameter is typed as
 * `SupabaseClient` — `supabaseAdmin` (from `@/lib/supabase/admin`) and any
 * standard supabase-js client satisfy it, and test mocks cast to it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** One base knowledge/Q&A row staged for `tenant_knowledge`. */
export interface TenantKnowledgeSeed {
  title: string;
  content: string;
  category: string;
}

/** Result of a seeding attempt — never throws for Postgrest errors. */
export interface SeedTenantDefaultsResult {
  seeded: number;
  error: string | null;
}

/**
 * Universal entries seeded for EVERY tenant regardless of industry.
 * Merged in front of the industry bucket so each seed run inserts
 * base(1) + industry(3) = 4 rows (within the 3–5 spec window).
 */
const BASE_SEEDS: readonly TenantKnowledgeSeed[] = [
  {
    title: 'Contacting This Business',
    content:
      'Customers can reach this business through the contact options provided on this site (phone, email, or contact form). When asked for hours, pricing, or availability that are not stated here, invite the customer to contact the business directly for the most accurate answer.',
    category: 'faq',
  },
];

/**
 * Modular industry lookup table → 3 essential base knowledge/Q&A items each.
 * Keys are normalized forms produced by normalizeSeedKey() (lower_snake_case).
 */
export const INDUSTRY_KNOWLEDGE_SEEDS: Record<string, readonly TenantKnowledgeSeed[]> = {
  automotive: [
    {
      title: 'Vehicle Services & Repairs',
      content:
        'We support vehicle sales, maintenance, and repair — including diagnostics, brakes, tires, and routine servicing. Confirm current availability and pricing with the shop before quoting specific figures.',
      category: 'faq',
    },
    {
      title: 'Scheduling an Appointment',
      content:
        'Customers can request a service or test-drive appointment. Collect their preferred date, time, and vehicle details, then direct them to call or use the contact options on this site to confirm the booking.',
      category: 'faq',
    },
    {
      title: 'Parts, Tires & Trade-Ins',
      content:
        'We can discuss parts sourcing, tire options, and trade-in guidance in general terms. Exact quotes require a vehicle inspection or VIN lookup — offer to arrange that with the team.',
      category: 'faq',
    },
  ],
  retail: [
    {
      title: 'Product Range & Availability',
      content:
        'We carry a curated range of products in-store and online. For live stock, sizes, and variants, verify with the store or direct the customer to the shop page before confirming availability.',
      category: 'faq',
    },
    {
      title: 'Orders, Returns & Exchanges',
      content:
        'Customers may ask about placing orders, returns, and exchanges. Collect the order details and direct them to the store policy or staff for the exact return window and any restocking terms.',
      category: 'faq',
    },
    {
      title: 'Shipping & Local Pickup',
      content:
        'We offer delivery and local pickup options where available. Ask for the customer’s location or postal code and confirm current shipping timelines with the store before promising a date.',
      category: 'faq',
    },
  ],
  healthcare: [
    {
      title: 'Services & Appointments',
      content:
        'We provide professional healthcare services and welcome appointment requests. Collect preferred times and contact details and direct patients to the clinic to confirm. Never provide medical diagnoses in chat — refer clinical questions to a practitioner.',
      category: 'faq',
    },
    {
      title: 'Privacy & Confidentiality',
      content:
        'Patient privacy is a priority. Do not request or repeat sensitive medical records, test results, or personal health details in chat; instead, direct patients to the clinic’s secure channels or phone line.',
      category: 'faq',
    },
    {
      title: 'Preparing for a Visit',
      content:
        'Advise first-time patients to bring a valid ID, insurance information, and a list of current medications, arriving a few minutes early for intake forms. For emergencies, always direct them to local emergency services.',
      category: 'faq',
    },
  ],
  insurance: [
    {
      title: 'Coverage We Handle',
      content:
        'We help customers explore insurance coverage options and compare plans. Provide high-level explanations only, and recommend a licensed agent for binding quotes or policy-specific coverage questions.',
      category: 'faq',
    },
    {
      title: 'Filing a Claim',
      content:
        'When a customer needs to file a claim, collect their policy number and a brief description of the incident, then direct them to the claims line or portal so a claims adjuster can take over.',
      category: 'faq',
    },
    {
      title: 'Policy Documents & Renewals',
      content:
        'Customers can request help with policy documents, ID cards, and renewal dates. Route document delivery and policy changes through the agency’s secure channels rather than sharing details in chat.',
      category: 'faq',
    },
  ],
  ai_automation: [
    {
      title: 'Solutions & Use Cases',
      content:
        'We build AI automation including agentic workflows, chatbots, and process automation. Describe relevant use cases (lead routing, support deflection, data entry, reporting) and offer a consultation to scope specifics.',
      category: 'faq',
    },
    {
      title: 'Onboarding & Integrations',
      content:
        'New automation projects start with a discovery call to map tools and data sources. Mention that we integrate with common CRM, email, and scheduling platforms, and offer to arrange a technical scoping session.',
      category: 'faq',
    },
    {
      title: 'Pricing & Consultations',
      content:
        'Pricing depends on scope and integrations. Avoid quoting fixed figures in chat — offer a free consultation so the team can prepare an accurate estimate for the customer’s use case.',
      category: 'faq',
    },
  ],
  hospitality: [
    {
      title: 'Rooms & Amenities',
      content:
        'We welcome guests with comfortable accommodations and on-site amenities. For room types, rates, and availability, collect the guest’s dates and confirm details with reservations before promising availability.',
      category: 'faq',
    },
    {
      title: 'Reservations & Check-in',
      content:
        'Guests can request reservations and ask about check-in/check-out times. Capture arrival dates, party size, and contact details, then direct them to the reservations team or booking page to confirm.',
      category: 'faq',
    },
    {
      title: 'Dining & Local Area',
      content:
        'We can share general information about on-site dining and local attractions. Confirm current opening hours and menus with the venue, and offer directions or restaurant recommendations for the area.',
      category: 'faq',
    },
  ],
  real_estate: [
    {
      title: 'Listings & Property Viewings',
      content:
        'We help buyers, sellers, and renters find properties and arrange viewings. Collect the customer’s preferred area, budget, and timing, then have an agent confirm showing availability.',
      category: 'faq',
    },
    {
      title: 'Buying vs. Renting',
      content:
        'Customers often ask about buying versus renting. Share high-level considerations (timeline, upfront costs, financing pre-approval) and recommend a consultation for market-specific advice.',
      category: 'faq',
    },
    {
      title: 'Offers, Documents & Next Steps',
      content:
        'When a customer is ready to make an offer or complete paperwork, route them to their agent so offers, disclosures, and contracts are handled by a licensed professional through official channels.',
      category: 'faq',
    },
  ],
  general: [
    {
      title: 'About Our Business',
      content:
        'We are a professional business dedicated to serving our customers with quality products and reliable service. Share an overview of what is listed on this site and invite customers to ask about specific needs.',
      category: 'faq',
    },
    {
      title: 'Products & Services',
      content:
        'We offer a range of products and services tailored to our customers. Highlight what is described on this site, and offer to connect the customer with the team for detailed or custom requirements.',
      category: 'faq',
    },
    {
      title: 'Common Customer Questions',
      content:
        'Customers commonly ask about availability, pricing, and how to get started. Answer from the information on this site when possible, and direct anything specific or unconfirmed to the business directly.',
      category: 'faq',
    },
  ],
};

/** Aliases mapping alternate normalized keys onto canonical bucket keys. */
const SEED_KEY_ALIASES: Record<string, string> = {
  general_business: 'general',
  gen: 'general',
  ai: 'ai_automation',
  automation: 'ai_automation',
  auto: 'automotive',
  estate: 'real_estate',
  hotels: 'hospitality',
};

const GENERAL_SEED_KEY = 'general';

/**
 * Normalizes any incoming industry string onto a canonical bucket key.
 * 'AUTOMOTIVE' → 'automotive'; 'AI AUTOMATION' → 'ai_automation';
 * 'general business' → 'general'; unknown values → 'general'. Never throws.
 */
export function normalizeSeedKey(industryCategory: string): string {
  const key = (industryCategory ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const aliased = SEED_KEY_ALIASES[key] ?? key;
  return aliased in INDUSTRY_KNOWLEDGE_SEEDS ? aliased : GENERAL_SEED_KEY;
}

/** Row shape written to `tenant_knowledge` by the seeder. */
export type TenantKnowledgeSeedRow = TenantKnowledgeSeed & {
  tenant_id: string;
  is_active: boolean;
};

/**
 * Pure row builder: merges the universal base entries with the normalized
 * industry bucket, stamped with the target tenant id.
 */
export function buildSeedRows(tenantId: string, industryCategory: string): TenantKnowledgeSeedRow[] {
  const bucket = INDUSTRY_KNOWLEDGE_SEEDS[normalizeSeedKey(industryCategory)];
  return [...BASE_SEEDS, ...bucket].map((entry) => ({
    tenant_id: tenantId,
    title: entry.title,
    content: entry.content,
    category: entry.category,
    is_active: true,
  }));
}

/**
 * Phase 4.1 — inserts the base knowledge rows for a freshly created tenant.
 *
 * Non-blocking by contract: Postgrest failures are returned as
 * `{ seeded: 0, error }` rather than thrown, and the caller's dedicated
 * try/catch guards against any residual exception so the primary tenant
 * creation response is never affected.
 */
export async function seedTenantDefaults(
  tenantId: string,
  industryCategory: string,
  supabaseClient: SupabaseClient,
): Promise<SeedTenantDefaultsResult> {
  if (!tenantId || tenantId.trim() === '') {
    return { seeded: 0, error: 'tenantId is required for knowledge seeding' };
  }

  const rows = buildSeedRows(tenantId, industryCategory);

  const { error } = await supabaseClient.from('tenant_knowledge').insert(rows);

  if (error) {
    return { seeded: 0, error: error.message };
  }

  return { seeded: rows.length, error: null };
}




