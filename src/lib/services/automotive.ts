import { createBrowserClient } from '@/lib/supabase';
import type { Vehicle } from '@/types';

/**
 * Mock NaTIS lookup result — mirrors the shape of what
 * Lightstone / TransUnion would return for a VIN decode.
 */
export interface NaTISLookupResult {
  vin: string;
  make: string;
  model: string;
  year: number;
  registration?: string;
  engine_capacity?: string;
  fuel_type?: string;
  transmission?: string;
  colour?: string;
  body_type?: string;
}

/**
 * Deterministic hash from VIN to seed mock data so the same VIN
 * always produces consistent results during development.
 */
function hashVIN(vin: string): number {
  let hash = 0;
  for (let i = 0; i < vin.length; i++) {
    const char = vin.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Mock NaTIS lookup — simulates a call to Lightstone or TransUnion.
 *
 * @param vin - The 17-character Vehicle Identification Number.
 * @param registration - Optional known registration plate to include.
 * @returns A promise that resolves with a NaTISLookupResult after a realistic delay.
 */
export async function mockNaTISLookup(
  vin: string,
  registration?: string,
): Promise<NaTISLookupResult> {
  // Simulate network latency (800ms – 1.5s)
  const delay = 800 + Math.floor(Math.random() * 700);
  await new Promise((resolve) => setTimeout(resolve, delay));

  const seed = hashVIN(vin);

  const makes = ['Toyota', 'Volkswagen', 'Ford', 'BMW', 'Mercedes-Benz', 'Nissan', 'Hyundai'];
  const models: Record<string, string[]> = {
    'Toyota': ['Hilux', 'Corolla', 'Fortuner', 'Rav4', 'Land Cruiser'],
    'Volkswagen': ['Golf', 'Polo', 'Tiguan', 'T-Cross', 'Amarok'],
    'Ford': ['Ranger', 'Everest', 'Focus', 'EcoSport', 'Mustang'],
    'BMW': ['3 Series', 'X5', 'X3', '5 Series', '1 Series'],
    'Mercedes-Benz': ['C-Class', 'E-Class', 'GLC', 'A-Class', 'GLE'],
    'Nissan': ['Navara', 'Qashqai', 'X-Trail', 'Magnite', 'Patrol'],
    'Hyundai': ['Tucson', 'i20', 'i10', 'Santa Fe', 'Kona'],
  };

  const fuelTypes = ['Petrol', 'Diesel', 'Hybrid', 'Electric'];
  const transmissions = ['Manual', 'Automatic', 'DSG'];
  const colours = ['White', 'Silver', 'Black', 'Blue', 'Red', 'Grey', 'Green'];
  const bodyTypes = ['SUV', 'Sedan', 'Hatchback', 'Bakkie', 'Coupe', 'Wagon'];

  const makeIndex = seed % makes.length;
  const make = makes[makeIndex];
  const makeModels = models[make] || models['Toyota'];
  const modelIndex = seed % makeModels.length;
  const model = makeModels[modelIndex];

  // Base year off seed so same VIN → same year; range 2015–2025
  const year = 2015 + (seed % 11);
  const engineOptions: Record<string, string[]> = {
    'Toyota': ['2.4L', '2.8L', '1.8L', '3.0L', '4.0L'],
    'Volkswagen': ['1.0L', '1.4L', '1.6L', '2.0L', '2.0 TDI'],
    'Ford': ['2.0L', '2.2L', '3.2L', '1.5L'],
    'BMW': ['2.0L', '3.0L', '2.0L TwinPower', '3.0L TwinPower'],
    'Mercedes-Benz': ['1.6L', '2.0L', '3.0L', '2.2L'],
    'Nissan': ['2.0L', '2.5L', '1.5L', '1.0L'],
    'Hyundai': ['1.6L', '2.0L', '1.0L', '1.4L'],
  };

  return {
    vin,
    make,
    model,
    year,
    registration: registration ?? `CA ${50_000 + seed}`,
    engine_capacity: (engineOptions[make] || engineOptions['Toyota'])[seed % 4],
    fuel_type: fuelTypes[seed % fuelTypes.length],
    transmission: transmissions[seed % transmissions.length],
    colour: colours[seed % colours.length],
    body_type: bodyTypes[seed % bodyTypes.length],
  };
}

/**
 * Construct a full Vehicle record from a NaTIS lookup result.
 * Useful for persisting to the database after a lookup.
 */
export function buildVehicleRecord(
  tenantId: string,
  lookup: NaTISLookupResult,
): Omit<Vehicle, 'id' | 'created_at'> {
  return {
    tenant_id: tenantId,
    vin: lookup.vin.toUpperCase(),
    registration: lookup.registration || undefined,
    make_model: `${lookup.make} ${lookup.model}`,
    year: lookup.year,
    natis_payload: { ...lookup },
  };
}

/**
 * Save a vehicle record to the database via Supabase.
 * Uses the browser client for RLS scoped to the authenticated user.
 *
 * @param vehicle - Vehicle data (without auto-generated `id` and `created_at`).
 * @returns The persisted Vehicle record including id and created_at.
 * @throws If the insert fails (caller should handle).
 */
export async function saveVehicle(
  vehicle: Omit<Vehicle, 'id' | 'created_at'>,
): Promise<Vehicle> {
  const supabase = createBrowserClient();

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      tenant_id: vehicle.tenant_id,
      vin: vehicle.vin,
      registration: vehicle.registration ?? null,
      make_model: vehicle.make_model ?? null,
      year: vehicle.year ?? null,
      natis_payload: vehicle.natis_payload,
    })
    .select('id, tenant_id, vin, registration, make_model, year, natis_payload, created_at')
    .single();

  if (error) {
    console.error('[saveVehicle] Supabase error:', error);
    throw new Error(`Failed to save vehicle: ${error.message}`);
  }

  // Ensure natis_payload is typed as Record<string, unknown>
  return {
    ...data,
    natis_payload: data.natis_payload as Record<string, unknown>,
  } as Vehicle;
}
