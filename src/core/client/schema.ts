// Client Domain Schema (Zod Validation)

import { z } from 'zod';

export const AddressSchema = z.object({
  street: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(1, "ZIP code is required"),
  country: z.string().min(1, "Country is required"),
});

export const DealershipSettingsSchema = z.object({
  timezone: z.string().default("UTC"),
  currency: z.string().default("USD"),
  language: z.string().default("en"),
});

export const DealershipBrandingSchema = z.object({
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"),
  logo_url: z.string().url().nullable(),
});

export const ClientTenantSchema = z.object({
  id: z.string().uuid(),
  dealership_name: z.string().min(2, "Dealership name must be at least 2 characters"),
  dealership_code: z.string().min(3, "Dealership code must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 characters"),
  address: AddressSchema,
  settings: DealershipSettingsSchema,
  branding: DealershipBrandingSchema,
  reseller_id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  is_active: z.boolean().default(true),
});

export const CreateClientTenantSchema = ClientTenantSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const UpdateClientTenantSchema = CreateClientTenantSchema.partial();
