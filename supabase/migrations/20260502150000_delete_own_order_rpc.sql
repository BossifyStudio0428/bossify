-- Reliable delete endpoint for the mobile app. It deletes only the signed-in
-- user's own order and returns true only when a row was actually removed.
create or replace function public.delete_own_order(_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.orders
  where id = _order_id
    and user_id = auth.uid();

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.delete_own_order(uuid) from public;
grant execute on function public.delete_own_order(uuid) to authenticated;
