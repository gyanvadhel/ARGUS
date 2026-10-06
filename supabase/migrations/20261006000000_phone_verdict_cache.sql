-- Call warnings: a shared 24-hour cache of phone verdicts, and the numbers many people have flagged.

-- No user ids; nobody can list it. Reached only through the functions below.
create table public.phone_verdicts (
  number text primary key check (number ~ '^\+[1-9][0-9]{7,14}$'),
  verdict jsonb not null,
  checked_at timestamptz not null default now()
);
alter table public.phone_verdicts enable row level security; -- no policies on purpose

-- 24 hours, not a week: community reports change verdicts, and reporting a number clears its entry.
create function public.get_phone_verdict(p_number text) returns jsonb
language sql security definer set search_path = '' stable as $$
  select verdict from public.phone_verdicts
  where number = p_number and p_number ~ '^\+[1-9][0-9]{7,14}$' and checked_at > now() - interval '24 hours';
$$;

create function public.put_phone_verdict(p_number text, p_verdict jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_number !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'bad number'; end if;
  insert into public.phone_verdicts (number, verdict, checked_at) values (p_number, p_verdict, now())
  on conflict (number) do update set verdict = excluded.verdict, checked_at = now();
end $$;

create function public.forget_phone_verdict(p_number text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_number !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'bad number'; end if;
  delete from public.phone_verdicts where number = p_number;
end $$;

-- Numbers 3+ different people reported as Scam/Fraud, or seen by 3+ different people in scam messages and reported
-- by at least one. Counting people, not rows, so a few throwaway accounts can't put a real business on everyone's
-- list. Numbers and labels only, never who reported.
create function public.known_scam_numbers() returns table(number text, label text)
language sql security definer set search_path = '' stable as $$
  with reported as (
    select r.number, count(distinct r.user_id) as n from public.phone_reports r
    where r.category in ('Scam', 'Fraud') group by r.number
  ), seen as (
    select s.number, count(distinct s.user_id) as n from public.phone_sightings s group by s.number
  )
  select reported.number, 'Reported as a scam by ' || reported.n || ' Argus users' from reported where reported.n >= 3
  union all
  select seen.number, 'Seen in scam messages by ' || seen.n || ' Argus users' from seen
  join reported on reported.number = seen.number
  where seen.n >= 3 and reported.n < 3;
$$;

-- The cache is the server's alone (secret key): a signed-in person can't plant or wipe the verdict others are shown.
revoke all on function public.get_phone_verdict(text), public.put_phone_verdict(text, jsonb),
  public.forget_phone_verdict(text), public.known_scam_numbers() from public, anon, authenticated;
grant execute on function public.get_phone_verdict(text), public.put_phone_verdict(text, jsonb),
  public.forget_phone_verdict(text) to service_role;
grant execute on function public.known_scam_numbers() to authenticated, service_role;
