-- Gmail connections: one per user. The refresh token is sealed (AES-256-GCM) by the web server before it's stored.
create table public.mail_connections (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail')),
  email text not null check (char_length(email) between 3 and 320),
  refresh_token text not null,
  created_at timestamptz not null default now()
);
alter table public.mail_connections enable row level security;
create policy mail_connections_select_own on public.mail_connections for select to authenticated using ((select auth.uid()) = user_id);
create policy mail_connections_insert_own on public.mail_connections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy mail_connections_update_own on public.mail_connections for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy mail_connections_delete_own on public.mail_connections for delete to authenticated using ((select auth.uid()) = user_id);

-- Which inbox messages have already been scanned, so opening the inbox again shows verdicts instantly.
create table public.mail_scans (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message_id text not null check (char_length(message_id) between 1 and 200),
  scan_id uuid not null references public.scans(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index mail_scans_scan_id_idx on public.mail_scans (scan_id);
alter table public.mail_scans enable row level security;
create policy mail_scans_select_own on public.mail_scans for select to authenticated using ((select auth.uid()) = user_id);
create policy mail_scans_insert_own on public.mail_scans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy mail_scans_delete_own on public.mail_scans for delete to authenticated using ((select auth.uid()) = user_id);
