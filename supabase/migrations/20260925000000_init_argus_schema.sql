create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('url','file','email','phone','text','call')),
  input_preview text not null default '' check (char_length(input_preview) <= 200),
  score int not null check (score between 0 and 100),
  level text not null check (level in ('SAFE','LOW/MODERATE','SUSPICIOUS','HIGH RISK','UNVERIFIED')),
  threat_type text not null default 'None',
  verdict jsonb not null,
  created_at timestamptz not null default now()
);
create index scans_user_created_idx on public.scans (user_id, created_at desc);
alter table public.scans enable row level security;
create policy scans_select_own on public.scans for select to authenticated using ((select auth.uid()) = user_id);
create policy scans_insert_own on public.scans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy scans_delete_own on public.scans for delete to authenticated using ((select auth.uid()) = user_id);

create table public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 32),
  notify_high_risk boolean not null default true,
  created_at timestamptz not null default now()
);
create index trusted_contacts_user_idx on public.trusted_contacts (user_id);
alter table public.trusted_contacts enable row level security;
create policy contacts_select_own on public.trusted_contacts for select to authenticated using ((select auth.uid()) = user_id);
create policy contacts_insert_own on public.trusted_contacts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy contacts_update_own on public.trusted_contacts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy contacts_delete_own on public.trusted_contacts for delete to authenticated using ((select auth.uid()) = user_id);

create table public.phone_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number text not null check (number ~ '^\+[1-9][0-9]{6,14}$'),
  category text not null check (category in ('Scam','Spam','Robocall','Fraud','Other')),
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  unique (user_id, number)
);
create index phone_reports_number_idx on public.phone_reports (number);
alter table public.phone_reports enable row level security;
-- community data: any signed-in user can read reports, but only write their own
create policy reports_select_all on public.phone_reports for select to authenticated using (true);
create policy reports_insert_own on public.phone_reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy reports_delete_own on public.phone_reports for delete to authenticated using ((select auth.uid()) = user_id);
