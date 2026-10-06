-- Call warnings: a shared 24-hour cache of phone verdicts, and the numbers many people have flagged.

-- No user ids; nobody can list it. Reached only through the functions below.
create table public.phone_verdicts (
  number text primary key check (number ~ '^\+[0-9]{8,15}$'),
  verdict jsonb not null,
  checked_at timestamptz not null default now()
);
alter table public.phone_verdicts enable row level security; -- no policies on purpose

-- 24 hours, not a week: community reports change verdicts, and reporting a number clears its entry.
create function public.get_phone_verdict(p_number text) returns jsonb
language sql security definer set search_path = '' stable as $$
  select verdict from public.phone_verdicts
  where number = p_number and p_number ~ '^\+[0-9]{8,15}$' and checked_at > now() - interval '24 hours';
$$;

create function public.put_phone_verdict(p_number text, p_verdict jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_number !~ '^\+[0-9]{8,15}$' then raise exception 'bad number'; end if;
  insert into public.phone_verdicts (number, verdict, checked_at) values (p_number, p_verdict, now())
  on conflict (number) do update set verdict = excluded.verdict, checked_at = now();
end $$;

create function public.forget_phone_verdict(p_number text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_number !~ '^\+[0-9]{8,15}$' then raise exception 'bad number'; end if;
  delete from public.phone_verdicts where number = p_number;
end $$;

-- Numbers with 3+ Scam/Fraud reports or 3+ sightings in scam messages. Numbers and labels only, never who reported.
create function public.known_scam_numbers() returns table(number text, label text)
language sql security definer set search_path = '' stable as $$
  with reported as (
    select r.number, count(*) as n from public.phone_reports r
    where r.category in ('Scam', 'Fraud') group by r.number having count(*) >= 3
  ), seen as (
    select s.number, count(*) as n from public.phone_sightings s group by s.number having count(*) >= 3
  )
  select reported.number, 'Reported as a scam by ' || reported.n || ' Argus users' from reported
  union all
  select seen.number, 'Seen in ' || seen.n || ' scam messages' from seen
  where seen.number not in (select reported.number from reported);
$$;

revoke all on function public.get_phone_verdict(text), public.put_phone_verdict(text, jsonb),
  public.forget_phone_verdict(text), public.known_scam_numbers() from public, anon;
grant execute on function public.get_phone_verdict(text), public.put_phone_verdict(text, jsonb),
  public.forget_phone_verdict(text), public.known_scam_numbers() to authenticated;
