-- 1. follow_ups table (idempotent)
CREATE TABLE IF NOT EXISTS public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  follow_up_date date NOT NULL,
  note text,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "follow_ups_select_own" ON public.follow_ups FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "follow_ups_insert_own" ON public.follow_ups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "follow_ups_update_own" ON public.follow_ups FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "follow_ups_delete_own" ON public.follow_ups FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS follow_ups_due_idx ON public.follow_ups (user_id, follow_up_date) WHERE is_done = false;

-- 2. Sender function: per-user push for follow-ups due today (or overdue) and not done
CREATE OR REPLACE FUNCTION public.send_followup_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cWxyZGJodm51Z3F2ZW1qZWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NTY3NDcsImV4cCI6MjA5NDAzMjc0N30.Y9T5utLkjgJoDybFDqhKMDlEAX87W5cTlCUPyWkeVd4';
  r record;
  _title text;
  _body text;
begin
  for r in
    select user_id,
           count(*) filter (where follow_up_date <= current_date) as due_count,
           count(*) filter (where follow_up_date < current_date) as overdue_count
    from public.follow_ups
    where is_done = false
      and follow_up_date <= current_date
    group by user_id
  loop
    _title := '📋 Follow-up Reminder';
    if r.overdue_count > 0 then
      _body := 'You have ' || r.due_count || ' follow-up(s) due today, including ' || r.overdue_count || ' overdue.';
    else
      _body := 'You have ' || r.due_count || ' follow-up(s) due today.';
    end if;

    perform net.http_post(
      url := _endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', _anon_key
      ),
      body := jsonb_build_object(
        'kind', 'custom',
        'targetUserId', r.user_id,
        'title', _title,
        'body', _body,
        'link', '/customers'
      )
    );
  end loop;
end;
$$;

-- 3. Schedule daily 09:00 Malaysia (UTC+8) = 01:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-followup-reminders-daily') THEN
    PERFORM cron.unschedule('send-followup-reminders-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'send-followup-reminders-daily',
  '0 1 * * *',
  $$ SELECT public.send_followup_reminders(); $$
);