ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS detail_images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.services  ADD COLUMN IF NOT EXISTS detail_images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.listings  ADD COLUMN IF NOT EXISTS detail_images jsonb NOT NULL DEFAULT '[]'::jsonb;