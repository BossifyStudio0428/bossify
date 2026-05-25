ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan = ANY (ARRAY['free'::text, 'starter'::text, 'pro'::text, 'lifetime'::text, 'team_starter'::text, 'team_pro'::text, 'team_business'::text]));