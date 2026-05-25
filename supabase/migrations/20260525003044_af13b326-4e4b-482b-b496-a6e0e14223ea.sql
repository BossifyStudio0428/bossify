-- Revoke EXECUTE from anon/authenticated/PUBLIC on internal SECURITY DEFINER functions
-- that are only meant to be invoked by triggers or scheduled jobs (never via PostgREST).

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.enforce_device_limit()',
    'public.set_device_tokens_updated_at()',
    'public.set_services_updated_at()',
    'public.handle_new_user_subscription()',
    'public.set_subscriptions_updated_at()',
    'public.handle_new_user_profile()',
    'public.set_profiles_updated_at()',
    'public.protect_lifetime_fields()',
    'public.sync_lifetime_email_on_user_change()',
    'public.prevent_profile_privilege_escalation()',
    'public.deduct_stock_on_order()',
    'public.sync_connected_platforms()',
    'public.protect_subscription_fields()',
    'public.protect_subscription_fields_insert()',
    'public.trigger_push_kind(text)',
    'public.send_followup_reminders()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
  END LOOP;
END $$;