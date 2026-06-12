ALTER TABLE public.services ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS cover_image_url text;