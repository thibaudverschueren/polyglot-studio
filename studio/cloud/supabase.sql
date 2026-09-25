-- Polyglot Studio v2 — databaseschema (Supabase, zelf gehost of in de cloud)
-- Idempotent: veilig om opnieuw uit te voeren. Alle objecten beginnen met polyglot_,
-- zodat ze naast andere projecten in dezelfde database kunnen staan zonder iets te raken.
--
-- Zelf gehost (MacBook 2):
--   ssh macbook2 'docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction' < studio/cloud/supabase.sql
-- Supabase-cloud: plak dit in SQL Editor → New query → Run.

-- 0. Leden: alleen accounts in deze lijst mogen de Polyglot-tabellen gebruiken.
--    Het eerste account dat zich via de app aanmeldt, wordt eigenaar (polyglot_join); daarna niemand meer.
create table if not exists public.polyglot_members (
  user_id  uuid        primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

create or replace function public.polyglot_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.polyglot_members where user_id = auth.uid())
$$;

create or replace function public.polyglot_join() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.polyglot_members where user_id = auth.uid()) then return true; end if;
  if exists (select 1 from public.polyglot_members) then return false; end if;
  insert into public.polyglot_members (user_id) values (auth.uid());
  return true;
end $$;

-- 1. Voortgang per toestel (lessen, kaarten, dagstatistieken)
create table if not exists public.polyglot_progress (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  device     text        not null,
  state      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, device)
);

-- 2. Leerlog: elke poging, test, herhaling en schrijfopdracht (dit leest Antigravity elke ochtend)
create table if not exists public.polyglot_events (
  user_id  uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id       text   not null,
  device   text   not null,
  ts       bigint not null,
  data     jsonb  not null,
  received bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  primary key (user_id, id)
);
create index if not exists polyglot_events_user_received on public.polyglot_events (user_id, received);
create index if not exists polyglot_events_user_ts on public.polyglot_events (user_id, ts);

-- 3. Coach-pakketten (geschreven door de ochtendrun op de Mac)
create table if not exists public.polyglot_coach (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  date       date        not null,
  pack       jsonb       not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- 4. Row Level Security: alleen het eigen account, en alleen als lid
alter table public.polyglot_members  enable row level security;
alter table public.polyglot_progress enable row level security;
alter table public.polyglot_events   enable row level security;
alter table public.polyglot_coach    enable row level security;

drop policy if exists polyglot_members_self on public.polyglot_members;
create policy polyglot_members_self on public.polyglot_members for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists polyglot_progress_own on public.polyglot_progress;
create policy polyglot_progress_own on public.polyglot_progress for all to authenticated
  using (auth.uid() = user_id and public.polyglot_is_member())
  with check (auth.uid() = user_id and public.polyglot_is_member());

drop policy if exists polyglot_events_select_own on public.polyglot_events;
create policy polyglot_events_select_own on public.polyglot_events for select to authenticated
  using (auth.uid() = user_id and public.polyglot_is_member());
drop policy if exists polyglot_events_insert_own on public.polyglot_events;
create policy polyglot_events_insert_own on public.polyglot_events for insert to authenticated
  with check (auth.uid() = user_id and public.polyglot_is_member());
-- (geen update/delete voor gebruikers: het leerlog is append-only)

drop policy if exists polyglot_coach_read_own on public.polyglot_coach;
create policy polyglot_coach_read_own on public.polyglot_coach for select to authenticated
  using (auth.uid() = user_id and public.polyglot_is_member());

-- 5. Rechten: anoniem niets; ingelogd enkel wat de app nodig heeft
revoke all on public.polyglot_members, public.polyglot_progress, public.polyglot_events, public.polyglot_coach from anon, authenticated;
grant select                 on public.polyglot_members  to authenticated;
grant select, insert, update on public.polyglot_progress to authenticated;
grant select, insert         on public.polyglot_events   to authenticated;
grant select                 on public.polyglot_coach    to authenticated;
grant all on public.polyglot_members, public.polyglot_progress, public.polyglot_events, public.polyglot_coach to service_role;
revoke all on function public.polyglot_join(), public.polyglot_is_member() from public, anon;
grant execute on function public.polyglot_join(), public.polyglot_is_member() to authenticated;

-- 6. PostgREST de nieuwe tabellen laten zien
notify pgrst, 'reload schema';
