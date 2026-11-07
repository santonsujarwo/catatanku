-- CatatKu Receipt Scanner schema migration.
-- Run after supabase/schema.sql in Supabase SQL Editor.
-- Safe to re-run: tables, indexes, bucket, and policies are created idempotently.

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  document_type text not null default 'other'
    check (document_type in (
      'grocery', 'restaurant', 'electricity_prepaid', 'electricity_postpaid',
      'utility', 'toll_transport', 'vehicle_tax', 'healthcare', 'invoice', 'other'
    )),
  merchant_name text,
  document_date date,
  storage_path text not null,
  original_filename text,
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes between 1 and 10485760),
  currency text not null default 'IDR',
  subtotal bigint check (subtotal is null or subtotal >= 0),
  tax_amount bigint check (tax_amount is null or tax_amount >= 0),
  service_fee bigint check (service_fee is null or service_fee >= 0),
  admin_fee bigint check (admin_fee is null or admin_fee >= 0),
  discount_amount bigint check (discount_amount is null or discount_amount >= 0),
  total_amount bigint check (total_amount is null or total_amount >= 0),
  billing_period text,
  usage_kwh numeric(12,3) check (usage_kwh is null or usage_kwh >= 0),
  purchased_value bigint check (purchased_value is null or purchased_value >= 0),
  received_kwh numeric(12,3) check (received_kwh is null or received_kwh >= 0),
  customer_reference text,
  ocr_engine text,
  ocr_status text not null default 'pending'
    check (ocr_status in ('pending', 'processing', 'completed', 'needs_review', 'failed')),
  ocr_confidence numeric(5,4) check (ocr_confidence is null or ocr_confidence between 0 and 1),
  ocr_warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(ocr_warnings) = 'array'),
  extracted_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(extracted_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, storage_path)
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text,
  unit_price bigint check (unit_price is null or unit_price >= 0),
  line_total bigint not null check (line_total >= 0),
  line_type text not null default 'product'
    check (line_type in ('product', 'service', 'tax', 'fee', 'discount', 'usage', 'other')),
  category text,
  sort_order integer not null default 0,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  source_text text,
  created_at timestamptz not null default now()
);

create index if not exists receipts_user_date_idx
  on public.receipts (user_id, document_date desc);
create index if not exists receipt_items_receipt_sort_idx
  on public.receipt_items (receipt_id, sort_order);
create index if not exists receipt_items_user_idx
  on public.receipt_items (user_id, created_at desc);

alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

drop policy if exists "Users can read their own receipts" on public.receipts;
create policy "Users can read their own receipts" on public.receipts
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own receipts" on public.receipts;
create policy "Users can insert their own receipts" on public.receipts
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.transactions t
      where t.id = transaction_id and t.user_id = (select auth.uid())
    )
    and storage_path like ((select auth.uid())::text || '/%')
  );

drop policy if exists "Users can update their own receipts" on public.receipts;
create policy "Users can update their own receipts" on public.receipts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and storage_path like ((select auth.uid())::text || '/%')
    and exists (
      select 1 from public.transactions t
      where t.id = transaction_id and t.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their own receipts" on public.receipts;
create policy "Users can delete their own receipts" on public.receipts
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own receipt items" on public.receipt_items;
create policy "Users can read their own receipt items" on public.receipt_items
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.receipts r
      where r.id = receipt_id and r.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can insert their own receipt items" on public.receipt_items;
create policy "Users can insert their own receipt items" on public.receipt_items
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.receipts r
      where r.id = receipt_id and r.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can update their own receipt items" on public.receipt_items;
create policy "Users can update their own receipt items" on public.receipt_items
  for update to authenticated using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.receipts r
      where r.id = receipt_id and r.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their own receipt items" on public.receipt_items;
create policy "Users can delete their own receipt items" on public.receipt_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Private bucket. Storage object paths must begin with the authenticated user UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own receipt files" on storage.objects;
create policy "Users can read their own receipt files" on storage.objects
  for select to authenticated using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own receipt files" on storage.objects;
create policy "Users can upload their own receipt files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own receipt files" on storage.objects;
create policy "Users can update their own receipt files" on storage.objects
  for update to authenticated using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own receipt files" on storage.objects;
create policy "Users can delete their own receipt files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Reuse the existing updated_at trigger function created by supabase/schema.sql.
drop trigger if exists receipts_updated_at on public.receipts;
create trigger receipts_updated_at before update on public.receipts
for each row execute procedure public.set_updated_at();


-- Atomic confirmation: creates the parent transaction, receipt, and item rows together.
-- This function runs with caller privileges and remains subject to the existing RLS policies.
create or replace function public.create_transaction_with_receipt(
  p_transaction jsonb,
  p_receipt jsonb,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_transaction_id uuid;
  v_receipt_id uuid;
  v_item jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if coalesce((p_transaction->>'amount')::bigint, 0) <= 0 then
    raise exception 'Transaction amount must be greater than zero';
  end if;

  if coalesce(p_receipt->>'storage_path', '') not like v_user_id::text || '/%' then
    raise exception 'Invalid receipt storage path';
  end if;

  insert into public.transactions (
    user_id, title, amount, kind, category, transaction_date
  ) values (
    v_user_id,
    coalesce(nullif(p_transaction->>'title', ''), 'Nota'),
    (p_transaction->>'amount')::bigint,
    'expense',
    coalesce(nullif(p_transaction->>'category', ''), 'Lainnya'),
    coalesce(nullif(p_transaction->>'transaction_date', '')::date, current_date)
  ) returning id into v_transaction_id;

  insert into public.receipts (
    user_id, transaction_id, document_type, merchant_name, document_date,
    storage_path, original_filename, mime_type, file_size_bytes, currency,
    subtotal, tax_amount, service_fee, admin_fee, discount_amount, total_amount,
    billing_period, usage_kwh, purchased_value, received_kwh, customer_reference,
    ocr_engine, ocr_status, ocr_confidence, ocr_warnings, extracted_data
  ) values (
    v_user_id,
    v_transaction_id,
    coalesce(nullif(p_receipt->>'document_type', ''), 'other'),
    nullif(p_receipt->>'merchant_name', ''),
    nullif(p_receipt->>'document_date', '')::date,
    p_receipt->>'storage_path',
    nullif(p_receipt->>'original_filename', ''),
    coalesce(p_receipt->>'mime_type', 'image/jpeg'),
    nullif(p_receipt->>'file_size_bytes', '')::bigint,
    coalesce(p_receipt->>'currency', 'IDR'),
    nullif(p_receipt->>'subtotal', '')::bigint,
    nullif(p_receipt->>'tax_amount', '')::bigint,
    nullif(p_receipt->>'service_fee', '')::bigint,
    nullif(p_receipt->>'admin_fee', '')::bigint,
    nullif(p_receipt->>'discount_amount', '')::bigint,
    nullif(p_receipt->>'total_amount', '')::bigint,
    nullif(p_receipt->>'billing_period', ''),
    nullif(p_receipt->>'usage_kwh', '')::numeric,
    nullif(p_receipt->>'purchased_value', '')::bigint,
    nullif(p_receipt->>'received_kwh', '')::numeric,
    nullif(p_receipt->>'customer_reference', ''),
    coalesce(p_receipt->>'ocr_engine', 'PaddleOCR'),
    coalesce(p_receipt->>'ocr_status', 'needs_review'),
    nullif(p_receipt->>'ocr_confidence', '')::numeric,
    coalesce(p_receipt->'ocr_warnings', '[]'::jsonb),
    coalesce(p_receipt->'extracted_data', '{}'::jsonb)
  ) returning id into v_receipt_id;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Receipt items must be an array';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if coalesce(nullif(v_item->>'description', ''), '') = '' then
      continue;
    end if;
    insert into public.receipt_items (
      receipt_id, user_id, description, quantity, unit, unit_price,
      line_total, line_type, category, sort_order, confidence, source_text
    ) values (
      v_receipt_id,
      v_user_id,
      left(v_item->>'description', 160),
      greatest(coalesce(nullif(v_item->>'quantity', '')::numeric, 1), 0.001),
      nullif(v_item->>'unit', ''),
      nullif(v_item->>'unit_price', '')::bigint,
      greatest(coalesce(nullif(v_item->>'line_total', '')::bigint, 0), 0),
      coalesce(nullif(v_item->>'line_type', ''), 'product'),
      nullif(v_item->>'category', ''),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      nullif(v_item->>'confidence', '')::numeric,
      nullif(v_item->>'source_text', '')
    );
  end loop;

  return v_transaction_id;
end;
$$;

grant execute on function public.create_transaction_with_receipt(jsonb, jsonb, jsonb) to authenticated;
