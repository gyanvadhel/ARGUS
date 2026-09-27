-- Counts checks per visitor (a keyed hash, never an address) in fixed time windows, so the free landing-page
-- check can't be hammered. Nobody can read or write the table directly; the website only calls take_check_slot.
create table public.check_usage (
  key text not null check (char_length(key) between 1 and 128),
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (key, window_start)
);
create index check_usage_window_start_idx on public.check_usage (window_start);
alter table public.check_usage enable row level security;
revoke all on public.check_usage from anon, authenticated;

-- Counts one check and says whether it's within the limit. One atomic upsert, so simultaneous checks can't
-- slip past; about one call in fifty also clears windows older than a day.
create function public.take_check_slot(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz;
  n integer;
begin
  if p_key is null or char_length(p_key) not between 1 and 128
     or p_limit not between 1 and 100000 or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit arguments';
  end if;
  win := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.check_usage as u (key, window_start) values (p_key, win)
  on conflict (key, window_start) do update set hits = u.hits + 1
  returning u.hits into n;
  if random() < 0.02 then
    delete from public.check_usage where window_start < now() - interval '1 day';
  end if;
  return n <= p_limit;
end;
$$;

revoke all on function public.take_check_slot(text, integer, integer) from public;
grant execute on function public.take_check_slot(text, integer, integer) to anon, authenticated;
