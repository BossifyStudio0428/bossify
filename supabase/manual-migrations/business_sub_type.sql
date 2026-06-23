-- =====================================================================
-- Business sub-type — manual migration
-- Run this in your external SQL editor (project: knouahqwazerjiyiqgmh)
--
-- Adds a sub-type to profiles so FnB sellers can pick between a
-- general takeaway-oriented shop and a full restaurant with dine-in
-- / table-management features.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_sub_type text;

-- Existing FnB profiles default to general (no dine-in features) until
-- the owner explicitly opts into the Restaurant sub-type. Other
-- business types leave this column NULL.
UPDATE public.profiles
   SET business_sub_type = 'general'
 WHERE business_type = 'fnb'
   AND business_sub_type IS NULL;