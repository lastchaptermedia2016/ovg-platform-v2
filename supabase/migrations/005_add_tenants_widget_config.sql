ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS widget_config jsonb DEFAULT '{}'::jsonb;
