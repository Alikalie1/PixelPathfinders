-- Run in Supabase SQL Editor. Safe to rerun after an interrupted run.
-- The bootstrap account must already exist in Auth.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  mode text,
  role text not null default 'member',
  member_no bigint generated always as identity,
  created_at timestamptz not null default now()
);

create or replace function public.new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone, mode)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'mode'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.profiles add column if not exists email text;
insert into public.profiles (id, email, full_name, phone, mode)
select
  id,
  email,
  raw_user_meta_data ->> 'full_name',
  raw_user_meta_data ->> 'phone',
  raw_user_meta_data ->> 'mode'
from auth.users
on conflict (id) do nothing;

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.email is distinct from auth_user.email;

drop trigger if exists on_signup on auth.users;
create trigger on_signup
  after insert on auth.users
  for each row execute function public.new_user();

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  bio text,
  photo_url text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  status text,
  image_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  title text,
  caption text,
  category text,
  image_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic text,
  session_date timestamptz not null,
  platform text,
  link text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz not null default now()
);

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

alter table public.team_members add column if not exists is_published boolean not null default true;
alter table public.projects add column if not exists is_published boolean not null default true;
alter table public.gallery_items add column if not exists is_published boolean not null default true;
alter table public.sessions add column if not exists is_published boolean not null default true;

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'super_admin')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.site_pages (
  slug text primary key,
  title text not null,
  description text,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_content (
  page_slug text not null references public.site_pages(slug) on delete cascade,
  content_key text not null,
  label text not null,
  value text not null default '',
  input_type text not null default 'text' check (input_type in ('text', 'textarea', 'url', 'email')),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (page_slug, content_key)
);

create table if not exists public.site_settings (
  setting_key text primary key,
  label text not null,
  value text not null default '',
  input_type text not null default 'text' check (input_type in ('text', 'textarea', 'url', 'email')),
  is_public boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_navigation_items (
  id uuid primary key default gen_random_uuid(),
  location text not null check (location in ('header', 'footer', 'legal')),
  label text not null,
  href text not null,
  sort_order integer not null default 0,
  is_cta boolean not null default false,
  is_active boolean not null default true,
  unique (location, href)
);

create table if not exists public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  seed_key text unique,
  page_slug text not null references public.site_pages(slug) on delete cascade,
  section_key text not null,
  title text not null default '',
  body text not null default '',
  image_url text,
  extra jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_roles
    where user_id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_roles
    where user_id = auth.uid()
      and role = 'super_admin'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_site_admin();
$$;

revoke all on function public.is_site_admin() from public;
revoke all on function public.is_super_admin() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_site_admin() to anon, authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.admin_roles enable row level security;
alter table public.site_pages enable row level security;
alter table public.site_content enable row level security;
alter table public.site_settings enable row level security;
alter table public.site_navigation_items enable row level security;
alter table public.content_blocks enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.gallery_items enable row level security;
alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.participants enable row level security;
alter table public.volunteers enable row level security;

grant select on public.profiles to authenticated;
grant select on public.admin_roles to authenticated;
grant select on public.site_pages, public.site_content, public.site_settings,
  public.site_navigation_items, public.content_blocks to anon, authenticated;
grant insert, update, delete on public.site_pages, public.site_content,
  public.site_settings, public.site_navigation_items, public.content_blocks
  to authenticated;
grant select on public.team_members, public.projects, public.gallery_items,
  public.sessions to anon, authenticated;
grant insert, update, delete on public.team_members, public.projects,
  public.gallery_items, public.sessions to authenticated;
grant insert on public.messages, public.participants, public.volunteers
  to anon, authenticated;
grant select, delete on public.messages, public.participants, public.volunteers
  to authenticated;

drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "admin reads profiles" on public.profiles;
drop policy if exists "profile owner or admin reads" on public.profiles;
create policy "profile owner or admin reads" on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.is_site_admin());

drop policy if exists "admin roles select" on public.admin_roles;
drop policy if exists "users read own role and super admins read all" on public.admin_roles;
create policy "users read own role and super admins read all"
  on public.admin_roles for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "site pages public read" on public.site_pages;
drop policy if exists "site pages admin write" on public.site_pages;
drop policy if exists "published site pages are public" on public.site_pages;
drop policy if exists "admins manage site pages" on public.site_pages;
create policy "published site pages are public" on public.site_pages
  for select to anon, authenticated
  using (is_published or public.is_site_admin());
create policy "admins manage site pages" on public.site_pages
  for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "site content public read" on public.site_content;
drop policy if exists "site content admin write" on public.site_content;
drop policy if exists "published site content is public" on public.site_content;
drop policy if exists "admins manage site content" on public.site_content;
create policy "published site content is public" on public.site_content
  for select to anon, authenticated
  using (is_published or public.is_site_admin());
create policy "admins manage site content" on public.site_content
  for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "site settings public read" on public.site_settings;
drop policy if exists "site settings admin write" on public.site_settings;
drop policy if exists "public site settings are readable" on public.site_settings;
drop policy if exists "admins manage site settings" on public.site_settings;
create policy "public site settings are readable" on public.site_settings
  for select to anon, authenticated
  using (is_public or public.is_site_admin());
create policy "admins manage site settings" on public.site_settings
  for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "navigation public read" on public.site_navigation_items;
drop policy if exists "navigation admin write" on public.site_navigation_items;
drop policy if exists "active navigation is public" on public.site_navigation_items;
drop policy if exists "admins manage navigation" on public.site_navigation_items;
create policy "active navigation is public" on public.site_navigation_items
  for select to anon, authenticated
  using (is_active or public.is_site_admin());
create policy "admins manage navigation" on public.site_navigation_items
  for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "content blocks public read" on public.content_blocks;
drop policy if exists "content blocks admin write" on public.content_blocks;
drop policy if exists "published blocks are public" on public.content_blocks;
drop policy if exists "admins manage content blocks" on public.content_blocks;
create policy "published blocks are public" on public.content_blocks
  for select to anon, authenticated
  using (is_published or public.is_site_admin());
create policy "admins manage content blocks" on public.content_blocks
  for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "public read" on public.team_members;
drop policy if exists "admin write" on public.team_members;
drop policy if exists "team members public read" on public.team_members;
drop policy if exists "team members admin write" on public.team_members;
drop policy if exists "published team members are public" on public.team_members;
drop policy if exists "admins manage team members" on public.team_members;
create policy "published team members are public" on public.team_members
  for select to anon, authenticated
  using (is_published or public.is_site_admin());
create policy "admins manage team members" on public.team_members
  for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "public read" on public.projects;
drop policy if exists "admin write" on public.projects;
drop policy if exists "projects public read" on public.projects;
drop policy if exists "projects admin write" on public.projects;
drop policy if exists "published projects are public" on public.projects;
drop policy if exists "admins manage projects" on public.projects;
create policy "published projects are public" on public.projects
  for select to anon, authenticated
  using (is_published or public.is_site_admin());
create policy "admins manage projects" on public.projects
  for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "public read" on public.gallery_items;
drop policy if exists "admin write" on public.gallery_items;
drop policy if exists "gallery public read" on public.gallery_items;
drop policy if exists "gallery admin write" on public.gallery_items;
drop policy if exists "published gallery items are public" on public.gallery_items;
drop policy if exists "admins manage gallery items" on public.gallery_items;
create policy "published gallery items are public" on public.gallery_items
  for select to anon, authenticated
  using (is_published or public.is_site_admin());
create policy "admins manage gallery items" on public.gallery_items
  for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "public read" on public.sessions;
drop policy if exists "admin write" on public.sessions;
drop policy if exists "sessions public read" on public.sessions;
drop policy if exists "sessions admin write" on public.sessions;
drop policy if exists "published sessions are public" on public.sessions;
drop policy if exists "admins manage sessions" on public.sessions;
create policy "published sessions are public" on public.sessions
  for select to anon, authenticated
  using (is_published or public.is_site_admin());
create policy "admins manage sessions" on public.sessions
  for all to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "anyone can send" on public.messages;
drop policy if exists "admin reads" on public.messages;
drop policy if exists "public messages insert" on public.messages;
drop policy if exists "admins read messages" on public.messages;
drop policy if exists "admins delete messages" on public.messages;
drop policy if exists "public can send messages" on public.messages;
create policy "public can send messages" on public.messages
  for insert to anon, authenticated with check (
    length(trim(name)) > 0 and length(trim(email)) > 0
    and length(trim(message)) > 0
  );
create policy "admins read messages" on public.messages
  for select to authenticated using (public.is_site_admin());
create policy "admins delete messages" on public.messages
  for delete to authenticated using (public.is_site_admin());

drop policy if exists "public registration insert" on public.participants;
drop policy if exists "public participant registration" on public.participants;
drop policy if exists "admin reads registrations" on public.participants;
drop policy if exists "public participants insert" on public.participants;
drop policy if exists "admins read participants" on public.participants;
drop policy if exists "admins delete participants" on public.participants;
drop policy if exists "public can register participants" on public.participants;
create policy "public can register participants" on public.participants
  for insert to anon, authenticated with check (
    consent and length(trim(full_name)) > 0 and length(trim(phone)) > 0
  );
create policy "admins read participants" on public.participants
  for select to authenticated using (public.is_site_admin());
create policy "admins delete participants" on public.participants
  for delete to authenticated using (public.is_site_admin());

drop policy if exists "public application insert" on public.volunteers;
drop policy if exists "public volunteer application" on public.volunteers;
drop policy if exists "admin reads applications" on public.volunteers;
drop policy if exists "public volunteers insert" on public.volunteers;
drop policy if exists "admins read volunteers" on public.volunteers;
drop policy if exists "admins delete volunteers" on public.volunteers;
drop policy if exists "public can apply as volunteer or partner" on public.volunteers;
create policy "public can apply as volunteer or partner" on public.volunteers
  for insert to anon, authenticated with check (
    consent and length(trim(full_name)) > 0 and length(trim(phone)) > 0
    and length(trim(email)) > 0
  );
create policy "admins read volunteers" on public.volunteers
  for select to authenticated using (public.is_site_admin());
create policy "admins delete volunteers" on public.volunteers
  for delete to authenticated using (public.is_site_admin());

insert into public.site_pages (slug, title, description) values
  ('index', 'Home', 'Pixel Pathfinders: from idea to impact, pixel by pixel.'),
  ('about', 'About', 'Vision, mission and values.'),
  ('team', 'Team', 'Meet the Pixel Pathfinders team.'),
  ('session', 'Sessions', 'Free Saturday sessions open to everybody.'),
  ('project', 'Projects', 'Projects built by Pixel Pathfinders.'),
  ('gallery', 'Gallery', 'Photos from sessions, training and events.'),
  ('contact', 'Contact', 'Contact Pixel Pathfinders.'),
  ('join', 'Join us', 'Register for a session, volunteer or partner.'),
  ('privacy', 'Privacy Policy', 'How Pixel Pathfinders handles personal data.'),
  ('terms', 'Terms and Conditions', 'Terms for using Pixel Pathfinders.')
on conflict (slug) do nothing;

insert into public.site_settings (setting_key, label, value, input_type, sort_order) values
  ('brand_name', 'Organisation name', 'Pixel Pathfinders', 'text', 1),
  ('tagline', 'Footer tagline', 'From idea to impact, pixel by pixel.', 'text', 2),
  ('contact_email', 'Contact email', 'hello@example.com', 'email', 3),
  ('facebook_url', 'Facebook URL', '#', 'text', 4),
  ('instagram_url', 'Instagram URL', '#', 'text', 5),
  ('x_url', 'X URL', '#', 'text', 6),
  ('linkedin_url', 'LinkedIn URL', '#', 'text', 7),
  ('youtube_url', 'YouTube URL', '#', 'text', 8),
  ('tiktok_url', 'TikTok URL', '#', 'text', 9),
  ('whatsapp_url', 'WhatsApp URL', '#', 'text', 10),
  ('telegram_url', 'Telegram URL', '#', 'text', 11),
  ('github_url', 'GitHub URL', '#', 'text', 12),
  ('copyright_text', 'Copyright footer', '© 2026 Pixel Pathfinders. Founded 9 September 2026.', 'text', 13),
  ('founders_count', 'Founders statistic', '6', 'text', 14),
  ('saturdays_count', 'Saturdays per year statistic', '52', 'text', 15),
  ('open_percent', 'Open to all statistic', '100', 'text', 16),
  ('footer_explore_label', 'Footer explore heading', 'Explore', 'text', 17),
  ('footer_legal_label', 'Footer legal heading', 'Legal', 'text', 18)
on conflict (setting_key) do nothing;

insert into public.site_navigation_items (location, label, href, sort_order, is_cta) values
  ('header', 'Home', 'index.html', 1, false),
  ('header', 'About', 'about.html', 2, false),
  ('header', 'Team', 'team.html', 3, false),
  ('header', 'Sessions', 'session.html', 4, false),
  ('header', 'Partners', 'index.html#partners', 5, false),
  ('header', 'Projects', 'project.html', 6, false),
  ('header', 'Gallery', 'gallery.html', 7, false),
  ('header', 'Contact', 'contact.html', 8, false),
  ('header', 'Join us', 'join.html', 9, true),
  ('footer', 'Home', 'index.html', 1, false),
  ('footer', 'About', 'about.html', 2, false),
  ('footer', 'Team', 'team.html', 3, false),
  ('footer', 'Sessions', 'session.html', 4, false),
  ('footer', 'Partners', 'index.html#partners', 5, false),
  ('footer', 'Projects', 'project.html', 6, false),
  ('footer', 'Gallery', 'gallery.html', 7, false),
  ('footer', 'Contact', 'contact.html', 8, false),
  ('legal', 'Privacy Policy', 'privacy.html', 1, false),
  ('legal', 'Terms and Conditions', 'terms.html', 2, false),
  ('legal', 'Become a member', 'join.html', 3, false)
on conflict (location, href) do nothing;

insert into public.site_content (page_slug, content_key, label, value, input_type, sort_order) values
  ('index', 'hero.founded', 'Hero founding date', 'Founded 9 September 2026', 'text', 1),
  ('index', 'hero.title_prefix', 'Hero title prefix', 'Every path starts with', 'text', 2),
  ('index', 'hero.title_focus', 'Hero title highlight', 'one pixel', 'text', 3),
  ('index', 'hero.body', 'Hero description', 'We teach digital skills, build digital solutions and turn ideas into impact. Free sessions, open to everybody.', 'textarea', 4),
  ('index', 'hero.primary', 'Hero primary button', 'Join a free session', 'text', 5),
  ('index', 'hero.secondary', 'Hero secondary button', 'Our story', 'text', 6),
  ('index', 'stats.founders_label', 'Founders statistic label', 'Founders', 'text', 7),
  ('index', 'stats.saturdays_label', 'Saturdays statistic label', 'Saturdays a year', 'text', 8),
  ('index', 'stats.open_label', 'Open statistic label', '% open to all', 'text', 9),
  ('index', 'services.heading', 'Services section heading', 'What we do', 'text', 10),
  ('index', 'vision.heading', 'Vision and mission section heading', 'Where we are going', 'text', 11),
  ('index', 'vision.title', 'Vision title', 'Our vision', 'text', 12),
  ('index', 'vision.body', 'Vision text', 'To be a trusted source of home-grown technology talent and digital solutions that open new paths for national and international development.', 'textarea', 13),
  ('index', 'mission.title', 'Mission title', 'Our mission', 'text', 14),
  ('index', 'mission.body', 'Mission text', 'To turn ideas into impact by designing and building digital solutions, developing working prototypes, mobilising investment for promising ideas, and growing sustainable businesses.', 'textarea', 15),
  ('index', 'values.heading', 'Values heading', 'Our values', 'text', 16),
  ('index', 'values.link', 'About link button', 'More about us', 'text', 17),
  ('index', 'sessions.heading', 'Sessions section heading', 'Upcoming sessions', 'text', 18),
  ('index', 'sessions.link', 'Sessions link button', 'All sessions', 'text', 19),
  ('index', 'path.heading', 'Learning pathway heading', 'Your path with Pixel Pathfinders', 'text', 20),
  ('index', 'path.intro', 'Learning pathway introduction', 'Start where you are. Each step leads to the next.', 'textarea', 21),
  ('index', 'path.cta', 'Volunteer link button', 'Volunteer or partner with us', 'text', 22),
  ('index', 'partners.heading', 'Partners section heading', 'Our partners', 'text', 23),
  ('index', 'partners.intro', 'Partners introduction', 'Work with us through sponsorship, mentoring, equipment, venues, or training.', 'textarea', 24),
  ('index', 'partners.cta', 'Partner link button', 'Become a partner', 'text', 25),
  ('index', 'meta.title', 'Browser tab title', 'Home | Pixel Pathfinders', 'text', 26),
  ('index', 'meta.description', 'Search description', 'Pixel Pathfinders: from idea to impact, pixel by pixel.', 'textarea', 27),
  ('about', 'page.title', 'Page title', 'About Pixel Pathfinders', 'text', 1),
  ('about', 'page.subtitle', 'Page subtitle', 'Pathfinders who build the digital future, one pixel at a time.', 'textarea', 2),
  ('about', 'vision.title', 'Vision title', 'Vision', 'text', 3),
  ('about', 'vision.body', 'Vision text', 'To be a trusted source of home-grown technology talent and digital solutions that open new paths for national and international development.', 'textarea', 4),
  ('about', 'mission.title', 'Mission title', 'Mission', 'text', 5),
  ('about', 'mission.body', 'Mission text', 'To turn ideas into impact by designing and building digital solutions, developing working prototypes, mobilising investment for promising ideas, and growing sustainable businesses.', 'textarea', 6),
  ('about', 'values.heading', 'Values heading', 'Our values', 'text', 7),
  ('about', 'meta.title', 'Browser tab title', 'About | Pixel Pathfinders', 'text', 8),
  ('about', 'meta.description', 'Search description', 'Vision, mission and values at Pixel Pathfinders.', 'textarea', 9),
  ('team', 'page.title', 'Page title', 'Meet the team', 'text', 1),
  ('team', 'page.subtitle', 'Page subtitle', 'Six people, one mission.', 'textarea', 2),
  ('team', 'meta.title', 'Browser tab title', 'Team | Pixel Pathfinders', 'text', 3),
  ('team', 'meta.description', 'Search description', 'Meet the Pixel Pathfinders team.', 'textarea', 4),
  ('session', 'page.title', 'Page title', 'Sessions and agenda', 'text', 1),
  ('session', 'page.subtitle', 'Page subtitle', 'Free Saturday sessions open to everybody.', 'textarea', 2),
  ('session', 'sessions.heading', 'Upcoming sessions heading', 'Upcoming sessions', 'text', 3),
  ('session', 'agenda.heading', 'Agenda heading', 'Agenda cards', 'text', 4),
  ('session', 'meta.title', 'Browser tab title', 'Sessions | Pixel Pathfinders', 'text', 5),
  ('session', 'meta.description', 'Search description', 'Free Saturday sessions open to everybody.', 'textarea', 6),
  ('project', 'page.title', 'Page title', 'Our projects', 'text', 1),
  ('project', 'page.subtitle', 'Page subtitle', 'What we are building and teaching.', 'textarea', 2),
  ('project', 'meta.title', 'Browser tab title', 'Projects | Pixel Pathfinders', 'text', 3),
  ('project', 'meta.description', 'Search description', 'Projects built and taught by Pixel Pathfinders.', 'textarea', 4),
  ('gallery', 'page.title', 'Page title', 'Gallery', 'text', 1),
  ('gallery', 'page.subtitle', 'Page subtitle', 'Sessions, training and moments from our work.', 'textarea', 2),
  ('gallery', 'meta.title', 'Browser tab title', 'Gallery | Pixel Pathfinders', 'text', 3),
  ('gallery', 'meta.description', 'Search description', 'Photos from Pixel Pathfinders sessions, training and events.', 'textarea', 4),
  ('contact', 'page.title', 'Page title', 'Contact us', 'text', 1),
  ('contact', 'page.subtitle', 'Page subtitle', 'Send us a message and we will reply.', 'textarea', 2),
  ('contact', 'form.submit', 'Contact submit button', 'Send message', 'text', 3),
  ('contact', 'meta.title', 'Browser tab title', 'Contact | Pixel Pathfinders', 'text', 4),
  ('contact', 'meta.description', 'Search description', 'Contact Pixel Pathfinders.', 'textarea', 5),
  ('join', 'page.title', 'Page title', 'Become a member', 'text', 1),
  ('join', 'page.subtitle', 'Page subtitle', 'Register or log in to Pixel Pathfinders.', 'textarea', 2),
  ('join', 'applications.heading', 'Application section heading', 'Register or apply', 'text', 3),
  ('join', 'applications.intro', 'Application introduction', 'Join a free learning session, apply to volunteer, or tell us how your organisation can partner with Pixel Pathfinders.', 'textarea', 4),
  ('join', 'member.heading', 'Member account heading', 'Member account', 'text', 5),
  ('join', 'member.intro', 'Member account introduction', 'Create an account or log in to manage your membership.', 'textarea', 6),
  ('join', 'meta.title', 'Browser tab title', 'Become a member | Pixel Pathfinders', 'text', 7),
  ('join', 'meta.description', 'Search description', 'Register for a session, volunteer or partner with Pixel Pathfinders.', 'textarea', 8),
  ('privacy', 'page.title', 'Page title', 'Privacy Policy', 'text', 1),
  ('privacy', 'page.subtitle', 'Page subtitle', 'Last updated 23 November 2026.', 'text', 2),
  ('privacy', 'collect.title', 'What we collect heading', 'What we collect', 'text', 3),
  ('privacy', 'collect.body', 'What we collect text', 'Names, email addresses, phone numbers, age groups, session preferences, learning goals, volunteer qualifications and availability, partner organisation details, messages, and account information you choose to send us.', 'textarea', 4),
  ('privacy', 'use.title', 'How we use it heading', 'How we use it', 'text', 5),
  ('privacy', 'use.body', 'How we use it text', 'To organise sessions, process participant registrations and volunteer or partner applications, reply to you, send reminders, and manage membership. We do not sell your data.', 'textarea', 6),
  ('privacy', 'rights.title', 'Data storage and rights heading', 'Storage and your rights', 'text', 7),
  ('privacy', 'rights.body', 'Data storage and rights text', 'Data is stored securely with Supabase. You may ask to see, correct or delete your data by contacting us.', 'textarea', 8),
  ('privacy', 'photos.title', 'Photos heading', 'Photos', 'text', 9),
  ('privacy', 'photos.body', 'Photos text', 'Photos from sessions may appear in our gallery with consent.', 'textarea', 10),
  ('privacy', 'meta.title', 'Browser tab title', 'Privacy Policy | Pixel Pathfinders', 'text', 11),
  ('privacy', 'meta.description', 'Search description', 'Pixel Pathfinders privacy policy.', 'textarea', 12),
  ('terms', 'page.title', 'Page title', 'Terms and Conditions', 'text', 1),
  ('terms', 'page.subtitle', 'Page subtitle', 'Last updated 23 November 2026.', 'text', 2),
  ('terms', 'use.title', 'Using this site heading', 'Using this site', 'text', 3),
  ('terms', 'use.body', 'Using this site text', 'Use the site lawfully and respectfully. Do not misuse accounts, forms or content.', 'textarea', 4),
  ('terms', 'membership.title', 'Membership heading', 'Membership', 'text', 5),
  ('terms', 'membership.body', 'Membership text', 'Members follow our Code of Conduct. We may suspend accounts that break it.', 'textarea', 6),
  ('terms', 'sessions.title', 'Sessions and applications heading', 'Sessions and applications', 'text', 7),
  ('terms', 'sessions.body', 'Sessions and applications text', 'Give accurate information when registering for a session or applying to volunteer or partner with us. Submitting an application does not guarantee a place or role; we will contact you about next steps.', 'textarea', 8),
  ('terms', 'content.title', 'Content heading', 'Content', 'text', 9),
  ('terms', 'content.body', 'Content text', 'The Pixel Pathfinders name, logo and content belong to Pixel Pathfinders.', 'textarea', 10),
  ('terms', 'liability.title', 'Liability heading', 'Liability', 'text', 11),
  ('terms', 'liability.body', 'Liability text', 'Sessions are provided as is. We are not liable for losses from using the site, as far as the law allows.', 'textarea', 12),
  ('terms', 'law.title', 'Law heading', 'Law', 'text', 13),
  ('terms', 'law.body', 'Law text', 'These terms follow the laws of Sierra Leone.', 'textarea', 14),
  ('terms', 'meta.title', 'Browser tab title', 'Terms and Conditions | Pixel Pathfinders', 'text', 15),
  ('terms', 'meta.description', 'Search description', 'Terms for using the Pixel Pathfinders website and services.', 'textarea', 16)
on conflict (page_slug, content_key) do nothing;

insert into public.site_content (page_slug, content_key, label, value, input_type, sort_order) values
  ('contact', 'form.name', 'Contact form name label', 'Name', 'text', 20),
  ('contact', 'form.email', 'Contact form email label', 'Email', 'text', 21),
  ('contact', 'form.subject', 'Contact form subject label', 'Subject', 'text', 22),
  ('contact', 'form.message', 'Contact form message label', 'Message', 'text', 23),
  ('join', 'form.full_name', 'Full name field label', 'Full name', 'text', 20),
  ('join', 'form.phone', 'Phone field label', 'Phone or WhatsApp', 'text', 21),
  ('join', 'form.email', 'Email field label', 'Email', 'text', 22),
  ('join', 'form.optional_email', 'Optional email field label', 'Email (optional)', 'text', 23),
  ('join', 'form.age_group', 'Age group field label', 'Age group', 'text', 24),
  ('join', 'form.session', 'Session field label', 'Session', 'text', 25),
  ('join', 'form.level', 'Skill level field label', 'Your level', 'text', 26),
  ('join', 'form.join_mode', 'Participant attendance label', 'How will you join?', 'text', 27),
  ('join', 'form.online', 'Online option label', 'Online', 'text', 28),
  ('join', 'form.in_person', 'In-person option label', 'In person', 'text', 29),
  ('join', 'form.learning_goals', 'Learning goals field label', 'What do you hope to learn? (optional)', 'text', 30),
  ('join', 'form.applying_as', 'Application role label', 'I am applying as', 'text', 31),
  ('join', 'form.volunteer', 'Volunteer option label', 'A volunteer', 'text', 32),
  ('join', 'form.partner', 'Partner option label', 'A partner', 'text', 33),
  ('join', 'form.organisation', 'Organisation field label', 'Organisation', 'text', 34),
  ('join', 'form.course', 'Course field label', 'Pixel Pathfinders course completed', 'text', 35),
  ('join', 'form.certificate', 'Certificate field label', 'Certificate number (optional)', 'text', 36),
  ('join', 'form.volunteer_mode', 'Volunteer attendance label', 'How will you volunteer?', 'text', 37),
  ('join', 'form.volunteer_areas', 'Volunteer areas label', 'Where can you help?', 'text', 38),
  ('join', 'form.partner_areas', 'Partner support areas label', 'How can you support us?', 'text', 39),
  ('join', 'form.availability', 'Availability field label', 'When are you available?', 'text', 40),
  ('join', 'form.volunteer_message', 'Volunteer message label', 'Tell us a little about yourself', 'text', 41),
  ('join', 'form.partner_message', 'Partner message label', 'Tell us about your organisation and what you can offer', 'text', 42),
  ('join', 'form.submit_participant', 'Participant submit button', 'Send my registration', 'text', 43),
  ('join', 'form.submit_application', 'Application submit button', 'Send my application', 'text', 44),
  ('join', 'form.register_tab', 'Register account tab', 'Register', 'text', 45),
  ('join', 'form.login_tab', 'Log in account tab', 'Log in', 'text', 46),
  ('join', 'form.password', 'Password field label', 'Password', 'text', 47),
  ('join', 'form.mode', 'Membership mode field label', 'Mode', 'text', 48),
  ('join', 'form.create_account', 'Create account button', 'Create account', 'text', 49),
  ('join', 'form.login', 'Log in button', 'Log in', 'text', 50),
  ('join', 'applications.participant_tab', 'Participant application tab', 'Join a session', 'text', 51),
  ('join', 'applications.volunteer_tab', 'Volunteer application tab', 'Volunteer or partner', 'text', 52),
  ('join', 'form.choose_one', 'Age group placeholder option', 'Choose one', 'text', 53),
  ('join', 'form.age_under_18', 'Age group under 18 option', 'Under 18', 'text', 54),
  ('join', 'form.age_18_25', 'Age group 18 to 25 option', '18 to 25', 'text', 55),
  ('join', 'form.age_26_35', 'Age group 26 to 35 option', '26 to 35', 'text', 56),
  ('join', 'form.age_36_plus', 'Age group 36 and over option', '36 and over', 'text', 57),
  ('join', 'form.any_session', 'Any upcoming session option', 'Any upcoming session', 'text', 58),
  ('join', 'form.level_beginner', 'Skill level beginner option', 'Beginner', 'text', 59),
  ('join', 'form.level_some', 'Skill level some skills option', 'Some skills', 'text', 60),
  ('join', 'form.level_advanced', 'Skill level advanced option', 'Advanced', 'text', 61),
  ('join', 'form.certificate_placeholder', 'Certificate number example', 'PP-CERT-0001', 'text', 62),
  ('join', 'form.availability_placeholder', 'Availability example', 'Days and hours', 'text', 63),
  ('join', 'form.participant_consent_prefix', 'Registration consent introduction', 'I agree to follow our', 'text', 64),
  ('join', 'form.participant_consent_suffix', 'Registration consent text', 'and be contacted about sessions. If I am under 18, a parent or guardian knows I am registering.', 'textarea', 65),
  ('join', 'form.application_consent_prefix', 'Application consent introduction', 'I agree to follow our', 'text', 66),
  ('join', 'form.application_consent_suffix', 'Application consent text', ', protect confidential information, and be contacted about my application.', 'textarea', 67),
  ('join', 'form.account_consent_prefix', 'Membership consent introduction', 'I accept the', 'text', 68),
  ('join', 'form.terms_link', 'Terms and conditions link label', 'Terms and Conditions', 'text', 69),
  ('join', 'form.terms_short', 'Short terms link label', 'Terms', 'text', 70),
  ('join', 'form.and', 'Conjunction in consent text', 'and', 'text', 71),
  ('join', 'form.privacy_link', 'Privacy policy link label', 'Privacy Policy', 'text', 72)
on conflict (page_slug, content_key) do nothing;

insert into public.content_blocks (seed_key, page_slug, section_key, title, body, extra, sort_order) values
  ('home-service-learning', 'index', 'home_services', 'Free digital skills', 'Practical Saturday sessions for everybody, online and in person.', '{"icon":"fa-solid fa-graduation-cap"}', 1),
  ('home-service-solutions', 'index', 'home_services', 'Build solutions', 'Websites, apps and prototypes for businesses and organisations.', '{"icon":"fa-solid fa-code"}', 2),
  ('home-service-volunteer', 'index', 'home_services', 'Volunteer', 'Complete a course, earn a certificate, then help real projects.', '{"icon":"fa-solid fa-hand-holding-heart"}', 3),
  ('home-service-courses', 'index', 'home_services', 'Courses and certificates', 'Develop practical skills through structured learning programmes.', '{"icon":"fa-solid fa-award"}', 4),
  ('home-service-ideas', 'index', 'home_services', 'Grow ideas', 'We support promising ideas until they become products.', '{"icon":"fa-solid fa-seedling"}', 5),
  ('home-path-session', 'index', 'home_pathway', 'Join a free session', 'Register online and attend a Saturday session.', '{}', 1),
  ('home-path-course', 'index', 'home_pathway', 'Complete a course', 'Build your skills and earn a certificate of completion.', '{}', 2),
  ('home-path-volunteer', 'index', 'home_pathway', 'Volunteer with us', 'Contribute to real projects in person or online.', '{}', 3),
  ('home-path-grow', 'index', 'home_pathway', 'Build and grow', 'Put your skills to work and help train the next group.', '{}', 4),
  ('home-partner-sponsorship', 'index', 'home_partner_areas', 'Sponsorship', '', '{}', 1),
  ('home-partner-mentoring', 'index', 'home_partner_areas', 'Mentoring', '', '{}', 2),
  ('home-partner-equipment', 'index', 'home_partner_areas', 'Equipment', '', '{}', 3),
  ('home-partner-venues', 'index', 'home_partner_areas', 'Community venues', '', '{}', 4),
  ('home-value-integrity', 'index', 'home_values', 'Integrity', '', '{}', 1),
  ('home-value-innovation', 'index', 'home_values', 'Innovation', '', '{}', 2),
  ('home-value-impact', 'index', 'home_values', 'Impact', '', '{}', 3),
  ('home-value-inclusion', 'index', 'home_values', 'Inclusion', '', '{}', 4),
  ('home-value-collaboration', 'index', 'home_values', 'Collaboration', '', '{}', 5),
  ('home-value-excellence', 'index', 'home_values', 'Excellence', '', '{}', 6),
  ('home-value-accountability', 'index', 'home_values', 'Accountability', '', '{}', 7),
  ('home-value-sustainability', 'index', 'home_values', 'Sustainability', '', '{}', 8),
  ('about-value-integrity', 'about', 'about_values', 'Integrity', 'We act honestly and keep our word.', '{"icon":"fa-solid fa-scale-balanced"}', 1),
  ('about-value-innovation', 'about', 'about_values', 'Innovation', 'We test ideas quickly and learn.', '{"icon":"fa-solid fa-lightbulb"}', 2),
  ('about-value-inclusion', 'about', 'about_values', 'Inclusion', 'Every person is welcome.', '{"icon":"fa-solid fa-users"}', 3),
  ('about-value-impact', 'about', 'about_values', 'Impact', 'We measure the difference we make.', '{"icon":"fa-solid fa-chart-line"}', 4),
  ('about-value-collaboration', 'about', 'about_values', 'Collaboration', 'We share knowledge and build better solutions together.', '{"icon":"fa-solid fa-people-group"}', 5),
  ('about-value-excellence', 'about', 'about_values', 'Excellence', 'We take pride in thoughtful, reliable work.', '{"icon":"fa-solid fa-star"}', 6),
  ('about-value-accountability', 'about', 'about_values', 'Accountability', 'We take responsibility for our work and commitments.', '{"icon":"fa-solid fa-scale-balanced"}', 7),
  ('about-value-sustainability', 'about', 'about_values', 'Sustainability', 'We create lasting value for learners and communities.', '{"icon":"fa-solid fa-seedling"}', 8),
  ('session-agenda-team', 'session', 'session_agenda', 'Team meeting', 'Saturday 28 November 2026, 8:00 to 9:00 PM', '{"items":["8:00|Welcome, vision and everyone’s views","8:10|Saturday sessions: day, time, platform","8:20|Roles for each session","8:35|First session topic","8:45|Website content and go-live date","8:55|Actions with names and deadlines"]}', 1),
  ('session-agenda-weekly', 'session', 'session_agenda', 'Saturday session', 'One hour, every week', '{"items":["0:00|Welcome and house rules (Nelson)","0:05|Lesson (Francis or Isata)","0:35|Hands-on activity","0:50|Questions and answers","0:55|Announcements and thanks"]}', 2),
  ('session-agenda-roles', 'session', 'session_agenda', 'Session roles', 'Everyone has a part', '{"items":["Alikalie|Head and pitch, media","Nelson|Session host","Francis, Isata|Lecturers","Adama|Programme support","Momoh|Partnerships"]}', 3),
  ('gallery-filter-sessions', 'gallery', 'gallery_filters', 'Sessions', '', '{}', 1),
  ('gallery-filter-training', 'gallery', 'gallery_filters', 'Training', '', '{}', 2),
  ('gallery-filter-events', 'gallery', 'gallery_filters', 'Events', '', '{}', 3),
  ('join-volunteer-area-teaching', 'join', 'join_volunteer_areas', 'Teaching support', '', '{}', 1),
  ('join-volunteer-area-design', 'join', 'join_volunteer_areas', 'Design', '', '{}', 2),
  ('join-volunteer-area-media', 'join', 'join_volunteer_areas', 'Media and social media', '', '{}', 3),
  ('join-volunteer-area-technical', 'join', 'join_volunteer_areas', 'Technical support', '', '{}', 4),
  ('join-volunteer-area-events', 'join', 'join_volunteer_areas', 'Events', '', '{}', 5),
  ('join-volunteer-area-admin', 'join', 'join_volunteer_areas', 'Administration', '', '{}', 6),
  ('join-partner-area-sponsor', 'join', 'join_partner_areas', 'Sponsorship', '', '{}', 1),
  ('join-partner-area-venue', 'join', 'join_partner_areas', 'Venue', '', '{}', 2),
  ('join-partner-area-mentor', 'join', 'join_partner_areas', 'Mentoring', '', '{}', 3),
  ('join-partner-area-equipment', 'join', 'join_partner_areas', 'Equipment', '', '{}', 4),
  ('join-partner-area-other', 'join', 'join_partner_areas', 'Other', '', '{}', 5)
on conflict (seed_key) do nothing;

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "media public read" on storage.objects;
drop policy if exists "admin upload" on storage.objects;
drop policy if exists "admins manage media" on storage.objects;
drop policy if exists "admins upload media" on storage.objects;
drop policy if exists "admins update media" on storage.objects;
drop policy if exists "admins delete media" on storage.objects;
create policy "media public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');
create policy "admins upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_site_admin());
create policy "admins update media" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.is_site_admin())
  with check (bucket_id = 'media' and public.is_site_admin());
create policy "admins delete media" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_site_admin());

do $seed_team$
begin
  if not exists (select 1 from public.team_members) then
    insert into public.team_members (name, role, bio, sort_order) values
      ('Alikalie Fofanah', 'CEO and Lead Founder', 'Leads the team, presents our mission and vision, and handles media.', 1),
      ('Nelson Peter David', 'Project Coordinator', 'Hosts sessions and keeps programme records.', 2),
      ('Francis Divine Johnson', 'Co-Founder', 'Lecturer and digital skills facilitator.', 3),
      ('Isata Vandi', 'Co-Founder', 'Lecturer and digital skills facilitator.', 4),
      ('Adama Bangura', 'Programme Manager', 'Supports programme materials and online technical help.', 5),
      ('Momoh Lansana Rogers', 'Partnerships Manager', 'Coordinates partnerships, sponsors and paid projects.', 6);
  end if;
end;
$seed_team$;

do $bootstrap_super_admin$
declare
  bootstrap_user_id uuid;
begin
  select id into bootstrap_user_id
  from auth.users
  where id = 'ff10ee4f-b418-4342-b959-4d41ad672a8e'::uuid
    and lower(email) = lower('fofanahalikalie0@gmail.com')
  limit 1;

  if bootstrap_user_id is null then
    raise exception 'The Supabase Auth user with the supplied UID and email was not found. Verify both values before running this migration.';
  end if;

  insert into public.admin_roles (user_id, role, created_by)
  values (bootstrap_user_id, 'super_admin', bootstrap_user_id)
  on conflict (user_id) do update
  set role = 'super_admin';
end;
$bootstrap_super_admin$;
