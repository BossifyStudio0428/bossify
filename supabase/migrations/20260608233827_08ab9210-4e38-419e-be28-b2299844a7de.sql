
CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  est_cost_usd numeric(12,8) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  error_msg text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_logs_created_at_idx ON public.ai_usage_logs (created_at DESC);
CREATE INDEX ai_usage_logs_feature_idx ON public.ai_usage_logs (feature);

GRANT SELECT ON public.ai_usage_logs TO authenticated;
GRANT ALL ON public.ai_usage_logs TO service_role;

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all AI usage"
  ON public.ai_usage_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());
