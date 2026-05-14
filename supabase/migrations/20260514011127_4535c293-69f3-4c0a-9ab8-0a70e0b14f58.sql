create or replace function public.trigger_push_kind(_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cWxyZGJodm51Z3F2ZW1qZWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NTY3NDcsImV4cCI6MjA5NDAzMjc0N30.Y9T5utLkjgJoDybFDqhKMDlEAX87W5cTlCUPyWkeVd4';
begin
  perform net.http_post(
    url := _endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', _anon_key,
      'Authorization', 'Bearer ' || _anon_key
    ),
    body := jsonb_build_object('kind', _kind, 'broadcast', true)
  );
end;
$$;

revoke execute on function public.trigger_push_kind(text) from public, anon, authenticated;