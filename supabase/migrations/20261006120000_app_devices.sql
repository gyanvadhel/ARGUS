-- Phase 6: Family Circle protection status & push notifications.
-- Tracks devices, their active protections, app versions, and FCM push tokens.
-- RLS ensures users can only read/write their own devices directly.
-- Family members query each other's status via the security-definer function family_status(),
-- which NEVER returns fcm_token.

create table public.app_devices (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  app_version text not null,
  protections jsonb not null default '{}'::jsonb,
  fcm_token text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index app_devices_user_id_idx on public.app_devices (user_id);
create index app_devices_last_seen_idx on public.app_devices (last_seen_at);

alter table public.app_devices enable row level security;

create policy "users manage their own devices" on public.app_devices
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Family status query: checks family_links and returns members' devices with their
-- protections and last seen timestamp. NEVER returns fcm_token.
create or replace function public.family_status()
returns table (
  member_id uuid,
  member_name text,
  device_id text,
  device_name text,
  app_version text,
  protections jsonb,
  last_seen_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    m.id as member_id,
    coalesce(nullif(m.raw_user_meta_data ->> 'full_name', ''), split_part(m.email, '@', 1)) as member_name,
    d.id as device_id,
    d.name as device_name,
    d.app_version,
    coalesce(d.protections, '{}'::jsonb) as protections,
    d.last_seen_at
  from public.family_links l
  join auth.users m on m.id = case when l.user_a = (select auth.uid()) then l.user_b else l.user_a end
  left join public.app_devices d on d.user_id = m.id
  where (select auth.uid()) in (l.user_a, l.user_b)
  order by m.id, d.last_seen_at desc nulls last;
$$;

revoke all on function public.family_status() from public, anon;
grant execute on function public.family_status() to authenticated;
