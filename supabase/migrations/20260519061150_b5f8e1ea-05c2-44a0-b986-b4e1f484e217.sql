CREATE OR REPLACE FUNCTION public.send_followup_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cWxyZGJodm51Z3F2ZW1qZWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NTY3NDcsImV4cCI6MjA5NDAzMjc0N30.Y9T5utLkjgJoDybFDqhKMDlEAX87W5cTlCUPyWkeVd4';
  r record;
begin
  for r in
    select user_id
    from public.follow_ups
    where is_done = false
      and follow_up_date <= current_date
    group by user_id
  loop
    perform net.http_post(
      url := _endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', _anon_key
      ),
      body := jsonb_build_object(
        'kind', 'follow_up_reminder',
        'targetUserId', r.user_id
      )
    );
  end loop;
end;
$function$;