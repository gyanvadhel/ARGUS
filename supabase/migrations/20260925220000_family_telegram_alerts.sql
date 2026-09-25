-- Family alerts over Telegram: a contact opts in by pressing Start on a one-time link, which gives us their chat.
alter table public.trusted_contacts
  add column telegram_chat_id bigint,
  add column telegram_name text check (telegram_name is null or char_length(telegram_name) <= 80),
  add column telegram_code text unique check (telegram_code is null or telegram_code ~ '^[A-Za-z0-9_-]{16,64}$');

-- Every alert sent (or that failed to send), so the Family page can show what went out.
create table public.family_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid references public.trusted_contacts(id) on delete set null,
  kind text not null check (kind in ('scan','call','test')),
  subject text not null check (char_length(subject) <= 300),
  score int not null check (score between 0 and 100),
  status text not null check (status in ('sent','failed')),
  created_at timestamptz not null default now()
);
create index family_alerts_user_created_idx on public.family_alerts (user_id, created_at desc);
create index family_alerts_contact_idx on public.family_alerts (contact_id);
alter table public.family_alerts enable row level security;
create policy family_alerts_select_own on public.family_alerts for select to authenticated using ((select auth.uid()) = user_id);
create policy family_alerts_insert_own on public.family_alerts for insert to authenticated with check ((select auth.uid()) = user_id);
