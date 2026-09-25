-- Polyglot Studio v2 — Supabase schema
-- Plak dit volledig in Supabase → SQL Editor → New query → Run. Het script is idempotent.

-- 1. Voortgang per toestel (lessen, kaarten, dagstatistieken)
create table if not exists public.progress (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  device     text        not null,
  state      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, device)
);

-- 2. Leerlog: elke poging, test, herhaling en schrijfopdracht (dit leest Antigravity elke ochtend)
create table if not exists public.events (
  user_id  uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id       text   not null,
  device   text   not null,
  ts       bigint not null,
  data     jsonb  not null,
  received bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  primary key (user_id, id)
);
create index if not exists events_user_received on public.events (user_id, received);
create index if not exists events_user_ts on public.events (user_id, ts);

-- 3. Coach-pakketten (geschreven door de Mac-orchestrator met de service-role key)
create table if not exists public.coach (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  date       date        not null,
  pack       jsonb       not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- 4. Row Level Security: iedereen ziet en schrijft uitsluitend zijn eigen rijen
alter table public.progress enable row level security;
alter table public.events   enable row level security;
alter table public.coach    enable row level security;

drop policy if exists progress_own on public.progress;
create policy progress_own on public.progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists events_select_own on public.events;
create policy events_select_own on public.events for select using (auth.uid() = user_id);
drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events for insert with check (auth.uid() = user_id);
-- (geen update/delete voor gebruikers: het leerlog is append-only)

drop policy if exists coach_read_own on public.coach;
create policy coach_read_own on public.coach for select using (auth.uid() = user_id);

-- 5. (Optioneel, aanbevolen) Enkel jouw e-mailadres mag een account aanmaken.
--    Vervang JOUW@EMAIL.BE hieronder en voer dit blok apart uit NA je eerste login.
-- create or replace function public.only_owner_signup() returns trigger
-- language plpgsql security definer as $$
-- begin
--   if lower(new.email) <> lower('JOUW@EMAIL.BE') then
--     raise exception 'Registratie gesloten';
--   end if;
--   return new;
-- end $$;
-- drop trigger if exists only_owner_signup on auth.users;
-- create trigger only_owner_signup before insert on auth.users
--   for each row execute function public.only_owner_signup();
