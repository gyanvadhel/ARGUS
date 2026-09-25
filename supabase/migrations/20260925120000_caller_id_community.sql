-- Community name tags on reports ("who is this caller?"), shown on the Caller ID card.
alter table public.phone_reports
  add column name_tag text check (name_tag is null or char_length(name_tag) between 1 and 60);

-- Sightings: a phone number found inside a high-risk text or email that an ARGUS user scanned.
create table public.phone_sightings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number text not null check (number ~ '^\+[1-9][0-9]{6,14}$'),
  channel text not null check (channel in ('text','email')),
  score int not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  unique (user_id, number, channel)
);
create index phone_sightings_number_idx on public.phone_sightings (number);
alter table public.phone_sightings enable row level security;
-- community data: any signed-in user can read sightings, but only record their own
create policy sightings_select_all on public.phone_sightings for select to authenticated using (true);
create policy sightings_insert_own on public.phone_sightings for insert to authenticated with check ((select auth.uid()) = user_id);
