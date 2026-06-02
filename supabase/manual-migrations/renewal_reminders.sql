-- =====================================================================
-- Renewal Reminders — manual migration
-- Run this in your external SQL editor (project: knouahqwazerjiyiqgmh)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.renewal_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid,
  reminder_type text NOT NULL DEFAULT 'insurance', -- insurance | tenancy | others
  policy_number text,
  expiry_date date NOT NULL,
  remind_days_before integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'active', -- active | renewed | expired
  notes text,
  last_notified_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS renewal_reminders_user_id_idx ON public.renewal_reminders(user_id);
CREATE INDEX IF NOT EXISTS renewal_reminders_customer_id_idx ON public.renewal_reminders(customer_id);
CREATE INDEX IF NOT EXISTS renewal_reminders_expiry_idx ON public.renewal_reminders(expiry_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.renewal_reminders TO authenticated;
GRANT ALL ON public.renewal_reminders TO service_role;

ALTER TABLE public.renewal_reminders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'renewal_reminders_select_own_or_team' AND tablename = 'renewal_reminders') THEN
    CREATE POLICY renewal_reminders_select_own_or_team ON public.renewal_reminders
      FOR SELECT TO authenticated USING (can_access_user_data(user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'renewal_reminders_insert_own' AND tablename = 'renewal_reminders') THEN
    CREATE POLICY renewal_reminders_insert_own ON public.renewal_reminders
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'renewal_reminders_update_own_or_team' AND tablename = 'renewal_reminders') THEN
    CREATE POLICY renewal_reminders_update_own_or_team ON public.renewal_reminders
      FOR UPDATE TO authenticated USING (can_access_user_data(user_id)) WITH CHECK (can_access_user_data(user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'renewal_reminders_delete_own_or_team' AND tablename = 'renewal_reminders') THEN
    CREATE POLICY renewal_reminders_delete_own_or_team ON public.renewal_reminders
      FOR DELETE TO authenticated USING (can_access_user_data(user_id));
  END IF;
END $$;

DROP TRIGGER IF EXISTS renewal_reminders_set_updated_at ON public.renewal_reminders;
CREATE TRIGGER renewal_reminders_set_updated_at
  BEFORE UPDATE ON public.renewal_reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_services_updated_at();

-- =====================================================================
-- Optional: daily push reminder job
-- Call public.send_renewal_reminders() from pg_cron once per day.
-- It pushes one notification per due reminder via the existing send-push
-- edge function and stamps last_notified_on so users aren't spammed.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.send_renewal_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _secret text;
  _request_id bigint;
  r record;
  _days_left integer;
  _title text;
  _body text;
  _client_name text;
BEGIN
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets
  WHERE name = 'PUSH_WEBHOOK_SECRET'
  LIMIT 1;

  IF _secret IS NULL THEN
    RAISE WARNING 'PUSH_WEBHOOK_SECRET not configured; skipping renewal reminders';
    RETURN;
  END IF;

  FOR r IN
    SELECT rr.*
    FROM public.renewal_reminders rr
    WHERE rr.status = 'active'
      AND rr.expiry_date >= current_date
      AND (rr.expiry_date - current_date) <= rr.remind_days_before
      AND (rr.last_notified_on IS NULL OR rr.last_notified_on < current_date)
  LOOP
    _days_left := (r.expiry_date - current_date)::integer;
    SELECT name INTO _client_name FROM public.customers WHERE id = r.customer_id;
    _title := '⚠️ Renewal Reminder';
    _body  := concat(coalesce(_client_name, 'Client'), ' · ', r.reminder_type, ' expires in ', _days_left, ' days');

    SELECT net.http_post(
      url := _endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', _secret),
      body := jsonb_build_object(
        'kind', 'renewal_reminder',
        'targetUserId', r.user_id,
        'title', _title,
        'body', _body,
        'link', '/renewals'
      ),
      timeout_milliseconds := 10000
    ) INTO _request_id;

    UPDATE public.renewal_reminders SET last_notified_on = current_date WHERE id = r.id;
  END LOOP;
END;
$$;
