alter table public.profiles add column if not exists payment_method_1_qr_url text;
alter table public.profiles add column if not exists payment_method_2_qr_url text;

insert into storage.buckets (id, name, public)
values ('payment-qr', 'payment-qr', true)
on conflict (id) do update set public = true;

do $$ begin
  create policy "payment-qr public read"
    on storage.objects for select
    using (bucket_id = 'payment-qr');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "payment-qr owner write"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'payment-qr' and auth.uid()::text = (storage.foldername(name))[1]);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "payment-qr owner update"
    on storage.objects for update to authenticated
    using (bucket_id = 'payment-qr' and auth.uid()::text = (storage.foldername(name))[1]);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "payment-qr owner delete"
    on storage.objects for delete to authenticated
    using (bucket_id = 'payment-qr' and auth.uid()::text = (storage.foldername(name))[1]);
exception when duplicate_object then null; end $$;
