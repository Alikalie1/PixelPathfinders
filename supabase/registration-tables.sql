-- Run in Supabase SQL Editor to enable the session and volunteer forms.

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  age_group text,
  session_id text,
  mode text not null,
  level text not null,
  goals text,
  consent boolean not null default false check (consent),
  created_at timestamptz not null default now()
);

create table if not exists public.volunteers (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('volunteer', 'partner')),
  full_name text not null,
  organisation text,
  phone text not null,
  email text not null,
  course_completed text,
  certificate_no text,
  mode text,
  areas text[] not null default '{}',
  availability text,
  message text,
  consent boolean not null default false check (consent),
  created_at timestamptz not null default now()
);

alter table public.participants enable row level security;
alter table public.volunteers enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.gallery_items enable row level security;
alter table public.sessions enable row level security;

grant select on public.team_members, public.projects, public.gallery_items, public.sessions
  to anon, authenticated;
grant insert on public.participants, public.volunteers to anon, authenticated;

drop policy if exists "public read" on public.team_members;
create policy "public read" on public.team_members
  for select to anon, authenticated using (true);

drop policy if exists "public read" on public.projects;
create policy "public read" on public.projects
  for select to anon, authenticated using (true);

drop policy if exists "public read" on public.gallery_items;
create policy "public read" on public.gallery_items
  for select to anon, authenticated using (true);

drop policy if exists "public read" on public.sessions;
create policy "public read" on public.sessions
  for select to anon, authenticated using (true);

drop policy if exists "public participant registration" on public.participants;
create policy "public participant registration"
  on public.participants
  for insert
  to anon, authenticated
  with check (
    consent
    and length(trim(full_name)) > 0
    and length(trim(phone)) > 0
  );

drop policy if exists "public volunteer application" on public.volunteers;
create policy "public volunteer application"
  on public.volunteers
  for insert
  to anon, authenticated
  with check (
    consent
    and length(trim(full_name)) > 0
    and length(trim(phone)) > 0
    and length(trim(email)) > 0
  );
