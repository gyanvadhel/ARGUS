-- take_check_slot is callable with the public key (the website calls it that way), so every counter name is a
-- 64-character keyed hash only the web server can compute, including the shared daily one. A direct caller can't
-- touch anyone's real counter; the most they can add is junk rows, which the daily clean-up removes.
create or replace function public.take_check_slot(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz;
  n integer;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$'
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
