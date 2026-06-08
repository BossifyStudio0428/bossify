ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS idx_ingredients_user_category ON public.ingredients(user_id, category);

CREATE TABLE IF NOT EXISTS public.ingredient_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ingredient_categories_user_lower_name_key
  ON public.ingredient_categories(user_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_ingredient_categories_user ON public.ingredient_categories(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredient_categories TO authenticated;
GRANT ALL ON public.ingredient_categories TO service_role;

ALTER TABLE public.ingredient_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredient_categories_select_own" ON public.ingredient_categories
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ingredient_categories_insert_own" ON public.ingredient_categories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ingredient_categories_update_own" ON public.ingredient_categories
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ingredient_categories_delete_own" ON public.ingredient_categories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);