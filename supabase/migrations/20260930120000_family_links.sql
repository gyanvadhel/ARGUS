-- Family circle, part one: invite links and the links between accounts they create. Both people consent: one by
-- inviting, the other by accepting. Codes are stored only as SHA-256 hashes. Either person can leave at any time.

create table public.family_invites (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  inviter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);
alter table public.family_invites enable row level security;
create policy "people create their own invites" on public.family_invites
  for insert to authenticated
  with check (inviter_id = (select auth.uid()) and used_at is null and used_by is null
              and expires_at <= now() + interval '7 days 1 minute');
create policy "people see their own invites" on public.family_invites
  for select to authenticated using (inviter_id = (select auth.uid()));

create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint family_links_ordered check (user_a < user_b),
  constraint family_links_unique unique (user_a, user_b)
);
alter table public.family_links enable row level security;
create policy "members see their links" on public.family_links
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));
create policy "members can leave" on public.family_links
  for delete to authenticated using ((select auth.uid()) in (user_a, user_b));
-- No insert or update policies: links are only ever created by accept_family_invite().

-- Who sent an invite (first name only) and whether it still works. Public, so the join page can greet people.
create function public.family_invite_info(p_code text)
returns table (inviter_name text, valid boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  inv public.family_invites;
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{16,64}$' then
    return query select null::text, false;
    return;
  end if;
  select * into inv from public.family_invites where code_hash = encode(extensions.digest(p_code, 'sha256'), 'hex');
  if not found then
    return query select null::text, false;
    return;
  end if;
  return query select
    nullif(split_part(coalesce((select u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = inv.inviter_id), ''), ' ', 1), ''),
    inv.used_at is null and inv.expires_at > now();
end;
$$;
revoke all on function public.family_invite_info(text) from public;
grant execute on function public.family_invite_info(text) to anon, authenticated;

create function public.accept_family_invite(p_code text)
returns table (link_id uuid, inviter_name text)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  inv public.family_invites;
  lid uuid;
begin
  if me is null then
    raise exception 'Sign in to join a family.';
  end if;
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'That invite link isn''t valid.';
  end if;
  select * into inv from public.family_invites
    where code_hash = encode(extensions.digest(p_code, 'sha256'), 'hex') for update;
  if not found or inv.used_at is not null or inv.expires_at <= now() then
    raise exception 'This invite has expired or was already used. Ask for a new one.';
  end if;
  if inv.inviter_id = me then
    raise exception 'That''s your own invite. Send it to a family member.';
  end if;
  insert into public.family_links (user_a, user_b)
    values (least(inv.inviter_id, me), greatest(inv.inviter_id, me))
    on conflict (user_a, user_b) do update set user_a = excluded.user_a
    returning id into lid;
  update public.family_invites set used_at = now(), used_by = me where code_hash = inv.code_hash;
  return query select lid,
    coalesce(nullif((select u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = inv.inviter_id), ''), 'your family member');
end;
$$;
revoke all on function public.accept_family_invite(text) from public, anon;
grant execute on function public.accept_family_invite(text) to authenticated;

create function public.my_family()
returns table (link_id uuid, member_id uuid, member_name text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, m.id,
         coalesce(nullif(m.raw_user_meta_data ->> 'full_name', ''), split_part(m.email, '@', 1)),
         l.created_at
  from public.family_links l
  join auth.users m on m.id = case when l.user_a = (select auth.uid()) then l.user_b else l.user_a end
  where (select auth.uid()) in (l.user_a, l.user_b)
  order by l.created_at;
$$;
revoke all on function public.my_family() from public, anon;
grant execute on function public.my_family() to authenticated;
