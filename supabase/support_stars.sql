-- Public, non-monetary messages for the shared support sky.
-- Run in the Supabase SQL editor before deploying the browser feature.
begin;

create table if not exists public.support_stars (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  support_type text not null check (
    support_type in ('特色课程', '家庭走访', '物资准备')
  ),
  message text not null check (
    char_length(btrim(message, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) between 1 and 60
  ),
  x numeric(5, 2) not null check (x between 0 and 100),
  y numeric(5, 2) not null check (y between 0 and 100),
  created_at timestamptz not null default now()
);

alter table public.support_stars enable row level security;

revoke all on table public.support_stars from public, anon, authenticated;
grant select on table public.support_stars to anon;
grant insert (client_id, support_type, message, x, y)
  on table public.support_stars to anon;

drop policy if exists support_stars_public_read on public.support_stars;
create policy support_stars_public_read
  on public.support_stars
  for select
  to anon
  using (true);

drop policy if exists support_stars_public_insert on public.support_stars;
create policy support_stars_public_insert
  on public.support_stars
  for insert
  to anon
  with check (
    support_type in ('特色课程', '家庭走访', '物资准备')
    and char_length(btrim(message, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) between 1 and 60
    and x between 0 and 100
    and y between 0 and 100
  );

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_stars'
  ) then
    alter publication supabase_realtime add table public.support_stars;
  end if;
end
$$;

commit;
