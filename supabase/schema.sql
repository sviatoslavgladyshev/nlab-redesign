-- Database for the nLab redesign. Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run again.

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
