-- Fix order visibility and deletion for the mobile app.
-- Orders must only be visible to their owner, and delete must remove exactly
-- the selected order when it belongs to the signed-in user.

alter table public.orders enable row level security;

drop policy if exists "own orders select" on public.orders;
create policy "own orders select"
  on public.orders
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own orders delete" on public.orders;
create policy "own orders delete"
  on public.orders
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.delete_own_order(_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  delete from public.orders
  where id = _order_id
    and user_id = auth.uid();

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.delete_own_order(uuid) from public;
grant execute on function public.delete_own_order(uuid) to authenticated;
