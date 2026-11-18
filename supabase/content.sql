-- nLab content in the database: every page, its alternative names, links, full-text search,
-- edit history and suggestions. The "backend" is a set of Postgres functions that the site calls
-- through Supabase (supabase.rpc(...)); writes go only through them.
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run (after schema.sql).
-- Safe to run again. Then fill it with: node scripts/db-import.mjs

create extension if not exists pg_trgm with schema extensions;

/* ---------------- pages ---------------- */
create table if not exists public.pages (
  id               bigint generated always as identity primary key,
  name             text not null check (char_length(name) between 1 and 300),
  source           text not null default '' check (char_length(source) <= 2000000),
  kind             text not null default 'c',            -- c concept · t theorem · p person · r reference · d disambiguation · s sandbox
  summary          text not null default '',
  fields           integer not null default 0,           -- bit i = field i (see graph.json "fields")
  inbound          integer not null default 0,           -- how many pages link here
  links            text[] not null default '{}',         -- lower-cased names this page links to
  origin           text not null default 'mirror' check (origin in ('mirror', 'site')),  -- site = edited here
  mirror_dir       text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null,
  updated_by_name  text,
  search           tsvector generated always as (
                     setweight(to_tsvector('english'::regconfig, name), 'A') ||
                     setweight(to_tsvector('english'::regconfig, summary), 'B') ||
                     setweight(to_tsvector('english'::regconfig, left(source, 100000)), 'C')) stored
);
create unique index if not exists pages_name_key on public.pages (lower(name));
create index if not exists pages_search_idx on public.pages using gin (search);
create index if not exists pages_links_idx on public.pages using gin (links);
create index if not exists pages_name_trgm on public.pages using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists pages_inbound_idx on public.pages (inbound desc);

create table if not exists public.page_aliases (
  alias    text primary key,                               -- lower-cased
  page_id  bigint not null references public.pages (id) on delete cascade
);
create index if not exists page_aliases_page_idx on public.page_aliases (page_id);

/* ---------------- history and suggestions ---------------- */
create table if not exists public.revisions (
  id           bigint generated always as identity primary key,
  page_id      bigint not null references public.pages (id) on delete cascade,
  source       text not null,
  author       uuid references auth.users (id) on delete set null,
  author_name  text,
  note         text not null default '' check (char_length(note) <= 500),
  created_at   timestamptz not null default now()
);
create index if not exists revisions_page_idx on public.revisions (page_id, created_at desc);

create table if not exists public.suggestions (
  id           bigint generated always as identity primary key,
  page_id      bigint not null references public.pages (id) on delete cascade,
  source       text not null check (char_length(source) <= 2000000),
  author       uuid references auth.users (id) on delete set null default auth.uid(),
  author_name  text,
  note         text not null default '' check (char_length(note) <= 2000),
  status       text not null default 'open' check (status in ('open', 'accepted', 'declined')),
  created_at   timestamptz not null default now()
);
create index if not exists suggestions_page_idx on public.suggestions (page_id, created_at desc);

/* ---------------- access: everyone reads; writes only through the functions below ---------------- */
alter table public.pages        enable row level security;
alter table public.page_aliases enable row level security;
alter table public.revisions    enable row level security;
alter table public.suggestions  enable row level security;
drop policy if exists "pages are public"       on public.pages;
drop policy if exists "aliases are public"     on public.page_aliases;
drop policy if exists "history is public"      on public.revisions;
drop policy if exists "suggestions are public" on public.suggestions;
create policy "pages are public"       on public.pages        for select to anon, authenticated using (true);
create policy "aliases are public"     on public.page_aliases for select to anon, authenticated using (true);
create policy "history is public"      on public.revisions    for select to anon, authenticated using (true);
create policy "suggestions are public" on public.suggestions  for select to anon, authenticated using (true);

/* ---------------- reading ---------------- */
-- a page by name or alternative name (case-insensitive)
create or replace function public.get_page(p_name text)
returns table (name text, source text, kind text, summary text, inbound integer, origin text, updated_at timestamptz, updated_by_name text)
language sql stable set search_path = public as $$
  select p.name, p.source, p.kind, p.summary, p.inbound, p.origin, p.updated_at, p.updated_by_name
  from (
    select id, 0 as prio from pages where lower(pages.name) = lower(btrim(p_name))
    union all
    select page_id, 1 from page_aliases where alias = lower(btrim(p_name))
  ) m join pages p on p.id = m.id
  order by m.prio
  limit 1;
$$;

-- full-text search over titles, summaries and the text of every page.
-- q uses web-search syntax: words, "exact phrase", OR, -excluded
create or replace function public.search_pages(q text, p_kind text default null, p_field integer default null, p_limit integer default 30, p_offset integer default 0)
returns table (name text, kind text, summary text, inbound integer, fields integer, rank real, snippet text, total bigint)
language sql stable set search_path = public as $$
  with query as (select websearch_to_tsquery('english', q) as tsq),
  hits as (
    select p.id, (ts_rank_cd(p.search, query.tsq, 32) * (1 + ln(1 + p.inbound) / 4))::real as rank, count(*) over () as total
    from pages p, query
    where p.search @@ query.tsq
      and (p_kind is null or p.kind = p_kind)
      and (p_field is null or (p.fields & (1 << p_field)) <> 0)
    order by rank desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  )
  select p.name, p.kind, p.summary, p.inbound, p.fields, h.rank,
         ts_headline('english', left(p.source, 30000), query.tsq, 'MaxFragments=1, MaxWords=30, MinWords=14, StartSel=⟦, StopSel=⟧'),
         h.total
  from hits h join pages p on p.id = h.id, query
  order by h.rank desc;
$$;

-- pages whose title is close to a (possibly misspelt) name
create or replace function public.similar_pages(p_name text, p_limit integer default 8)
returns table (name text, kind text, inbound integer, similarity real)
language sql stable set search_path = public, extensions as $$
  select name, kind, inbound, similarity(lower(name), lower(p_name)) as similarity
  from pages
  where lower(name) % lower(p_name)
  order by similarity desc, inbound desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- pages that link to this one (through its name or any alternative name)
create or replace function public.backlinks(p_name text, p_limit integer default 60)
returns table (name text, kind text, summary text, inbound integer)
language sql stable set search_path = public as $$
  with target as (
    select p.id, array_prepend(lower(p.name), coalesce(array_agg(a.alias) filter (where a.alias is not null), '{}')) as names
    from pages p left join page_aliases a on a.page_id = p.id
    where p.id = (select id from pages where lower(name) = lower(btrim(p_name))
                  union all select page_id from page_aliases where alias = lower(btrim(p_name)) limit 1)
    group by p.id, p.name
  )
  select p.name, p.kind, p.summary, p.inbound
  from pages p, target
  where p.links && target.names and p.id <> target.id
  order by p.inbound desc
  limit least(greatest(p_limit, 1), 200);
$$;

-- which of these names are pages (by name or alternative name); for marking links to missing pages
create or replace function public.pages_exist(p_names text[])
returns setof text
language sql stable set search_path = public as $$
  select n from unnest(p_names[1:500]) as n
  where exists (select 1 from pages where lower(pages.name) = lower(btrim(n)))
     or exists (select 1 from page_aliases where alias = lower(btrim(n)));
$$;

-- the edit history of a page on this site
create or replace function public.page_history(p_name text, p_limit integer default 30)
returns table (id bigint, author_name text, note text, created_at timestamptz, chars integer)
language sql stable set search_path = public as $$
  select r.id, r.author_name, r.note, r.created_at, char_length(r.source)
  from revisions r join pages p on p.id = r.page_id
  where lower(p.name) = lower(btrim(p_name))
  order by r.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

/* ---------------- writing (signed-in users) ---------------- */
create or replace function public.author_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(raw_user_meta_data ->> 'name'), ''), split_part(email, '@', 1), 'anonymous')
  from auth.users where id = auth.uid();
$$;

-- Publish a page. New pages, sandboxes and pages started on this site are edited directly;
-- other nLab pages take suggestions (see suggest_edit).
create or replace function public.save_page(p_name text, p_source text, p_summary text default '', p_links text[] default '{}', p_note text default '')
returns table (name text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  who text;
  pid bigint;
  pg  pages%rowtype;
begin
  if uid is null then raise exception 'Please sign in to publish.' using errcode = '28000'; end if;
  if char_length(btrim(p_name)) = 0 or char_length(p_name) > 300 then raise exception 'Please give the page a title.'; end if;
  if char_length(p_source) > 2000000 then raise exception 'This page is too long to publish.'; end if;
  who := author_name();
  select * into pg from pages where lower(pages.name) = lower(btrim(p_name));
  if not found then
    insert into pages (name, source, kind, summary, links, origin, updated_by, updated_by_name)
    values (btrim(p_name), p_source, case when btrim(p_name) ~* 'sandbox' then 's' else 'c' end, left(coalesce(p_summary, ''), 400),
            coalesce(p_links, '{}'), 'site', uid, who)
    returning id into pid;
  else
    if pg.origin = 'mirror' and pg.name !~* '^sandbox[0-9]*$' then
      raise exception 'This nLab page takes suggestions: use “Suggest an edit”.' using errcode = '42501';
    end if;
    update pages set source = p_source, summary = left(coalesce(nullif(p_summary, ''), pages.summary), 400),
                     links = coalesce(p_links, pages.links), origin = 'site', updated_at = now(), updated_by = uid, updated_by_name = who
    where id = pg.id;
    pid := pg.id;
  end if;
  insert into revisions (page_id, source, author, author_name, note) values (pid, p_source, uid, who, left(coalesce(p_note, ''), 500));
  return query select p.name, p.updated_at from pages p where p.id = pid;
end $$;

-- Suggest an edit to an existing page; authors review suggestions on the site.
create or replace function public.suggest_edit(p_name text, p_source text, p_note text default '')
returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pid bigint; sid bigint;
begin
  if uid is null then raise exception 'Please sign in to suggest an edit.' using errcode = '28000'; end if;
  select id into pid from pages where lower(name) = lower(btrim(p_name));
  if pid is null then raise exception 'There is no page called %.', p_name; end if;
  if (select count(*) from suggestions where author = uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That is a lot of suggestions: please wait a little before sending more.';
  end if;
  insert into suggestions (page_id, source, author, author_name, note)
  values (pid, p_source, uid, author_name(), left(coalesce(p_note, ''), 2000)) returning id into sid;
  return sid;
end $$;

/* ---------------- loading the nLab (service key only: scripts/db-import.mjs) ---------------- */
-- Adds or refreshes pages from the nLab mirror. Pages edited on this site are left alone.
create or replace function public.import_pages(rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into pages (name, source, kind, summary, fields, inbound, links, mirror_dir, origin, updated_at)
  select r ->> 'name', coalesce(r ->> 'source', ''), coalesce(r ->> 'kind', 'c'), coalesce(r ->> 'summary', ''),
         coalesce((r ->> 'fields')::int, 0), coalesce((r ->> 'inbound')::int, 0),
         coalesce(array(select jsonb_array_elements_text(r -> 'links')), '{}'), r ->> 'dir', 'mirror', now()
  from jsonb_array_elements(rows) r
  on conflict ((lower(name))) do update
    set source = excluded.source, kind = excluded.kind, summary = excluded.summary, fields = excluded.fields,
        inbound = excluded.inbound, links = excluded.links, mirror_dir = excluded.mirror_dir, updated_at = now()
    where pages.origin = 'mirror' and (pages.source is distinct from excluded.source or pages.inbound <> excluded.inbound
                                       or pages.summary is distinct from excluded.summary or pages.fields <> excluded.fields);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.import_aliases(rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into page_aliases (alias, page_id)
  select distinct on (lower(r ->> 'alias')) lower(r ->> 'alias'), p.id   -- first page wins when two share a name
  from jsonb_array_elements(rows) with ordinality as e(r, ord) join pages p on lower(p.name) = lower(r ->> 'name')
  where lower(r ->> 'alias') <> lower(p.name)
  order by lower(r ->> 'alias'), e.ord
  on conflict (alias) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

/* ---------------- who may call what ---------------- */
revoke all on function public.get_page(text), public.search_pages(text, text, integer, integer, integer), public.similar_pages(text, integer),
                       public.backlinks(text, integer), public.page_history(text, integer), public.pages_exist(text[]), public.author_name(),
                       public.save_page(text, text, text, text[], text), public.suggest_edit(text, text, text),
                       public.import_pages(jsonb), public.import_aliases(jsonb) from public, anon, authenticated;
grant execute on function public.get_page(text), public.search_pages(text, text, integer, integer, integer), public.similar_pages(text, integer),
                          public.backlinks(text, integer), public.page_history(text, integer), public.pages_exist(text[]) to anon, authenticated;
grant execute on function public.save_page(text, text, text, text[], text), public.suggest_edit(text, text, text) to authenticated;
grant execute on function public.import_pages(jsonb), public.import_aliases(jsonb) to service_role;
