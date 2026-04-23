-- Seed data for demo tenant
INSERT INTO tenants (slug, name, branding_color, voice_id, system_prompt)
VALUES (
  'demo',
  'OVG Platform Demo',
  '#0097b2',
  'hannah',
  'You are a helpful and friendly AI assistant for the OVG Platform. You help users understand our white-label SaaS voice infrastructure solution.'
)
ON CONFLICT (slug) DO NOTHING;
