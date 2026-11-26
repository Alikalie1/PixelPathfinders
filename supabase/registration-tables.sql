-- Run after website-cms-admin.sql to enable session, volunteer, and event
-- registration forms and PPM/PPV member IDs.

do $$
begin
  if to_regclass('public.events') is null
    or to_regclass('public.profiles') is null
    or to_regprocedure('public.is_site_admin()') is null then
    raise exception 'Run website-cms-admin.sql before enabling member event registrations.';
  end if;
end
$$;

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
  user_id uuid references auth.users(id) on delete set null,
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
  volunteer_no text,
  created_at timestamptz not null default now()
);

alter table public.volunteers
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.volunteers add column if not exists volunteer_no text;
alter table public.profiles add column if not exists volunteer_no text;

create sequence if not exists public.volunteer_no_seq
  as integer minvalue 1 maxvalue 100000 start with 1 no cycle;

do $$
begin
  if exists (
    select 1
    from public.profiles
    where member_no < 1 or member_no > 100000
  ) then
    raise exception 'Existing member numbers must be between 1 and 100000 before applying the member ID limit.';
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_member_no_range'
  ) then
    alter table public.profiles
      add constraint profiles_member_no_range
      check (member_no between 1 and 100000);
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_volunteer_no_range'
  ) then
    alter table public.profiles
      add constraint profiles_volunteer_no_range
      check (
        volunteer_no is null
        or volunteer_no ~ '^PPV([1-9][0-9]{0,4}|100000)$'
      );
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.volunteers'::regclass
      and conname = 'volunteers_volunteer_no_range'
  ) then
    alter table public.volunteers
      add constraint volunteers_volunteer_no_range
      check (
        volunteer_no is null
        or volunteer_no ~ '^PPV([1-9][0-9]{0,4}|100000)$'
      );
  end if;
end
$$;

drop index if exists public.volunteers_volunteer_no_unique;
create unique index if not exists profiles_volunteer_no_unique
  on public.profiles(volunteer_no)
  where volunteer_no is not null;

do $$
declare
  current_sequence_value bigint;
  current_sequence_called boolean;
  highest_volunteer_no bigint;
begin
  select last_value, is_called
    into current_sequence_value, current_sequence_called
  from public.volunteer_no_seq;
  select coalesce(max(assigned.number), 0)
    into highest_volunteer_no
  from (
    select substring(volunteer_no from '^PPV([0-9]+)$')::bigint as number
    from public.profiles
    where volunteer_no ~ '^PPV[0-9]+$'
    union all
    select substring(volunteer_no from '^PPV([0-9]+)$')::bigint
    from public.volunteers
    where volunteer_no ~ '^PPV[0-9]+$'
  ) as assigned;
  if highest_volunteer_no > current_sequence_value
    or (highest_volunteer_no = current_sequence_value
      and highest_volunteer_no > 0
      and not current_sequence_called) then
    perform setval(
      'public.volunteer_no_seq',
      highest_volunteer_no,
      true
    );
  end if;
end
$$;

drop trigger if exists assign_member_volunteer_no on public.volunteers;

update public.profiles as profile
set volunteer_no = applications.volunteer_no
from (
  select user_id, min(volunteer_no) as volunteer_no
  from public.volunteers
  where user_id is not null
    and role = 'volunteer'
    and volunteer_no ~ '^PPV[0-9]+$'
  group by user_id
) as applications
where profile.id = applications.user_id
  and profile.volunteer_no is null;

update public.profiles as profile
set volunteer_no = 'PPV' || nextval('public.volunteer_no_seq')::text
where profile.volunteer_no is null
  and exists (
    select 1
    from public.volunteers
    where user_id = profile.id
      and role = 'volunteer'
  );

update public.volunteers as application
set volunteer_no = profile.volunteer_no
from public.profiles as profile
where application.user_id = profile.id
  and application.role = 'volunteer'
  and application.volunteer_no is distinct from profile.volunteer_no;

create or replace function public.assign_member_volunteer_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null or new.role <> 'volunteer' then
    new.volunteer_no := null;
    return new;
  end if;

  update public.profiles
  set volunteer_no = coalesce(
    volunteer_no,
    'PPV' || nextval('public.volunteer_no_seq')::text
  )
  where id = new.user_id
  returning volunteer_no into new.volunteer_no;

  if not found then
    raise exception 'A member profile is required to assign a volunteer ID.';
  end if;
  return new;
end;
$$;

revoke all on function public.assign_member_volunteer_no() from public;
create trigger assign_member_volunteer_no
  before insert or update of user_id, role
  on public.volunteers
  for each row execute function public.assign_member_volunteer_no();

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_title text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.participants enable row level security;
alter table public.volunteers enable row level security;
alter table public.event_registrations enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.gallery_items enable row level security;
alter table public.sessions enable row level security;

grant select on public.team_members, public.projects, public.gallery_items, public.sessions
  to anon, authenticated;
grant insert on public.participants, public.volunteers to anon, authenticated;
grant select, insert, delete on public.event_registrations to authenticated;

drop policy if exists "members register for events" on public.event_registrations;
drop policy if exists "members and admins read event registrations" on public.event_registrations;
drop policy if exists "admins delete event registrations" on public.event_registrations;
create policy "members register for events" on public.event_registrations
  for insert to authenticated with check (
    user_id = auth.uid()
    and length(trim(full_name)) > 0
    and length(trim(email)) > 0
    and exists (
      select 1
      from public.events
      where events.id = event_id
        and events.title = event_title
        and events.is_published
        and events.event_date > now()
    )
  );
create policy "members and admins read event registrations"
  on public.event_registrations for select to authenticated
  using (user_id = auth.uid() or public.is_site_admin());
create policy "admins delete event registrations"
  on public.event_registrations for delete to authenticated
  using (public.is_site_admin());

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
