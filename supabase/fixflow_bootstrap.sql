-- FixFlow Supabase bootstrap
-- Run this in Supabase SQL Editor against a fresh project.
--
-- Notes:
-- 1. This bootstrap is tailored to the current repository code.
-- 2. App tables are left without RLS for local development because the app
--    currently uses Clerk IDs rather than Supabase Auth JWTs.
-- 3. Storage policies below are intentionally permissive for local testing.
--    Tighten them before production use.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_property_unit_count()
returns trigger
language plpgsql
as $$
declare
  target_property_id uuid;
begin
  target_property_id := coalesce(new.property_id, old.property_id);

  update public.properties
  set unit_count = (
    select count(*)
    from public.units
    where property_id = target_property_id
  ),
  updated_at = now()
  where id = target_property_id;

  if tg_op = 'UPDATE' and old.property_id is distinct from new.property_id then
    update public.properties
    set unit_count = (
      select count(*)
      from public.units
      where property_id = old.property_id
    ),
    updated_at = now()
    where id = old.property_id;
  end if;

  return coalesce(new, old);
end;
$$;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  landlord_id text not null,
  address text not null,
  city text not null,
  state text not null,
  zip text not null,
  unit_count integer not null default 1 check (unit_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_label text not null,
  tenant_id text,
  tenant_name text,
  tenant_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, unit_label)
);

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  tenant_id text not null,
  photo_url text not null,
  description text,
  status text not null default 'submitted',
  diagnosis jsonb,
  contractors jsonb,
  vetting jsonb,
  work_order jsonb,
  voice_update_url text,
  voice_transcript text,
  assigned_contractor jsonb,
  estimated_cost_low integer,
  estimated_cost_high integer,
  landlord_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_requests_status_check check (
    status in (
      'submitted',
      'diagnosing',
      'diagnosed',
      'contractors',
      'vetting',
      'work_order',
      'notifying',
      'dispatched',
      'in_progress',
      'resolved',
      'error'
    )
  ),
  constraint maintenance_requests_cost_range_check check (
    estimated_cost_low is null
    or estimated_cost_high is null
    or estimated_cost_low <= estimated_cost_high
  )
);

create index if not exists properties_landlord_id_idx
  on public.properties (landlord_id);

create index if not exists units_property_id_idx
  on public.units (property_id);

create index if not exists units_tenant_id_idx
  on public.units (tenant_id);

create index if not exists maintenance_requests_unit_id_idx
  on public.maintenance_requests (unit_id);

create index if not exists maintenance_requests_tenant_id_idx
  on public.maintenance_requests (tenant_id);

create index if not exists maintenance_requests_status_idx
  on public.maintenance_requests (status);

create index if not exists maintenance_requests_created_at_idx
  on public.maintenance_requests (created_at desc);

drop trigger if exists set_properties_updated_at on public.properties;
create trigger set_properties_updated_at
before update on public.properties
for each row
execute function public.set_updated_at();

drop trigger if exists set_units_updated_at on public.units;
create trigger set_units_updated_at
before update on public.units
for each row
execute function public.set_updated_at();

drop trigger if exists set_maintenance_requests_updated_at on public.maintenance_requests;
create trigger set_maintenance_requests_updated_at
before update on public.maintenance_requests
for each row
execute function public.set_updated_at();

drop trigger if exists sync_property_unit_count_after_insert on public.units;
create trigger sync_property_unit_count_after_insert
after insert on public.units
for each row
execute function public.sync_property_unit_count();

drop trigger if exists sync_property_unit_count_after_update on public.units;
create trigger sync_property_unit_count_after_update
after update of property_id on public.units
for each row
execute function public.sync_property_unit_count();

drop trigger if exists sync_property_unit_count_after_delete on public.units;
create trigger sync_property_unit_count_after_delete
after delete on public.units
for each row
execute function public.sync_property_unit_count();

do $$
begin
  begin
    alter publication supabase_realtime add table public.maintenance_requests;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'maintenance-photos',
  'maintenance-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'FixFlow dev read maintenance-photos'
  ) then
    create policy "FixFlow dev read maintenance-photos"
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'maintenance-photos');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'FixFlow dev insert maintenance-photos'
  ) then
    create policy "FixFlow dev insert maintenance-photos"
      on storage.objects
      for insert
      to anon, authenticated
      with check (bucket_id = 'maintenance-photos');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'FixFlow dev update maintenance-photos'
  ) then
    create policy "FixFlow dev update maintenance-photos"
      on storage.objects
      for update
      to anon, authenticated
      using (bucket_id = 'maintenance-photos')
      with check (bucket_id = 'maintenance-photos');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'FixFlow dev delete maintenance-photos'
  ) then
    create policy "FixFlow dev delete maintenance-photos"
      on storage.objects
      for delete
      to anon, authenticated
      using (bucket_id = 'maintenance-photos');
  end if;
end $$;

-- Optional demo seed:
-- 1. Replace the placeholder Clerk IDs below.
-- 2. Run this block after the schema above.
--
-- with new_property as (
--   insert into public.properties (
--     landlord_id,
--     address,
--     city,
--     state,
--     zip
--   )
--   values (
--     '<LANDLORD_CLERK_USER_ID>',
--     '482 Atlantic Ave',
--     'Brooklyn',
--     'NY',
--     '11217'
--   )
--   returning id
-- )
-- insert into public.units (
--   property_id,
--   unit_label,
--   tenant_id,
--   tenant_name,
--   tenant_phone
-- )
-- select
--   new_property.id,
--   seed.unit_label,
--   seed.tenant_id,
--   seed.tenant_name,
--   seed.tenant_phone
-- from new_property
-- cross join (
--   values
--     ('Apt 1A', '<TENANT_CLERK_USER_ID>', 'Sarah', '555-0101'),
--     ('Apt 2B', null, 'Marcus', '555-0102'),
--     ('Apt 3C', null, null, null)
-- ) as seed(unit_label, tenant_id, tenant_name, tenant_phone);
