-- Database for the nLab redesign. Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run again.

-- Private profile and synced preferences. Each account can access only its own row.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  affiliation text not null default '' check (char_length(affiliation) <= 120),
  bio text not null default '' check (char_length(bio) <= 500),
  theme text check (theme in ('system', 'light', 'dark')),
  focus_read boolean
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Drafts: one row per user and page. Each person can only see and change their own.
create table if not exists public.drafts (
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 300),
  source    text not null check (char_length(source) <= 1000000),
  is_new    boolean not null default false,
  saved_at  timestamptz not null default now(),
  primary key (user_id, name)
);
alter table public.drafts enable row level security;
drop policy if exists "own drafts: read"   on public.drafts;
drop policy if exists "own drafts: add"    on public.drafts;
drop policy if exists "own drafts: change" on public.drafts;
drop policy if exists "own drafts: delete" on public.drafts;
create policy "own drafts: read"   on public.drafts for select to authenticated using (user_id = (select auth.uid()));
create policy "own drafts: add"    on public.drafts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own drafts: change" on public.drafts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own drafts: delete" on public.drafts for delete to authenticated using (user_id = (select auth.uid()));

-- Self-service deletion. The expected ID prevents deleting a newly switched account.
create or replace function public.delete_my_account(p_expected_user uuid, p_confirmation text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null or account_id is distinct from p_expected_user then
    raise exception 'Sign in again to delete your account.' using errcode = '42501';
  end if;
  if p_confirmation is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm.' using errcode = '22023';
  end if;
  delete from auth.users where id = account_id;
end;
$$;
revoke all on function public.delete_my_account(uuid, text) from public, anon;
grant execute on function public.delete_my_account(uuid, text) to authenticated;

-- Updates list: anyone may add their email; nobody can read the list through the site
-- (you see it in the dashboard: Table Editor → subscribers, and can export it as CSV).
create table if not exists public.subscribers (
  id          bigint generated always as identity primary key,
  email       text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 320),
  topics      text[] not null default '{}' check (cardinality(topics) <= 10),
  created_at  timestamptz not null default now()
);
alter table public.subscribers enable row level security;
drop policy if exists "anyone can subscribe" on public.subscribers;
create policy "anyone can subscribe" on public.subscribers for insert to anon, authenticated with check (true);
