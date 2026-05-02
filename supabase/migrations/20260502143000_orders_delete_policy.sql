-- Allow users to delete their own orders.
-- Without this policy, supabase.from("orders").delete() silently affects 0 rows
-- (no error returned), which made deleted orders "come back" on refetch.
drop policy if exists "own orders delete" on public.orders;
create policy "own orders delete"
  on public.orders
  for delete
  to authenticated
  using (auth.uid() = user_id);
