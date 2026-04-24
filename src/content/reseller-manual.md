# OVG-Platform-V2 | Reseller Operations Manual

## 1. Executive Overview
The Reseller Console is a high-level management dashboard designed for "Production Excellence." This guide governs the white-labeled empire.

## 2. Branding & White-Labeling (Governance)
- **Inheritance Logic:** Assets flow from Reseller -> Tenant. 
- **Global Colors:** Primary accent is Electric Blue (#0097b2).
- **Overrides:** If a Tenant provides a `custom_asset`, it silently overrides the Reseller's global asset for that instance only.

## 3. Client (Tenant) Management
- **Branding Toggle:** Resellers have the "Master Power" to hide/show "Powered by OVG" branding per client.
- **Tiering:** Clients must be mapped to 'basic', 'pro', or 'enterprise'.

## 4. Revenue Engine (Stripe Connect)
- **Account Type:** Stripe Connect Express.
- **Price Syncing:** Price IDs must be generated on the Reseller's connected account, not the Platform account.
- **Payouts:** Automated recurring billing is handled via the Stripe Price IDs stored in the `pricing_tiers` JSONB.
