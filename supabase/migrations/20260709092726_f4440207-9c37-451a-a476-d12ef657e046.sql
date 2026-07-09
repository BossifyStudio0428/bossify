-- Allow users to view their own AI usage logs
CREATE POLICY "Users view own AI usage"
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add WITH CHECK to ingredient_categories update policy to prevent ownership reassignment
DROP POLICY IF EXISTS ingredient_categories_update_own ON public.ingredient_categories;
CREATE POLICY ingredient_categories_update_own
  ON public.ingredient_categories
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);