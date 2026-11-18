-- Smart search (RAG retrieval) in the database: every page has an embedding, a 384-number "meaning"
-- of its title, summary and opening text, made with the open gte-small model. Search combines
--   • meaning: pages whose embedding is closest to the question's (pgvector, HNSW index), and
--   • words:   the full-text index (exact terms, phrases, -exclusions),
-- merged with reciprocal-rank fusion, so "particles that braid in two dimensions" finds anyons and
-- "Yoneda" still puts the Yoneda lemma first. The same embeddings give each page its related pages.
--
-- Run once in the Supabase dashboard (SQL Editor) after content.sql. Then:
--   node scripts/db-embed.mjs                  (computes and uploads the page embeddings)
--   supabase/functions/search                  (deploy: embeds the question, calls hybrid_search)

create extension if not exists vector with schema extensions;

alter table public.pages add column if not exists embedding extensions.halfvec(384);
alter table public.pages add column if not exists embedded_at timestamptz;
create index if not exists pages_embedding_idx on public.pages
  using hnsw (embedding extensions.halfvec_cosine_ops) with (m = 16, ef_construction = 64);

-- Words + meaning. q_embedding may be null (then it is a word search).
create or replace function public.hybrid_search(
  q text, q_embedding extensions.halfvec(384) default null,
  p_kind text default null, p_field integer default null, p_limit integer default 40,
  w_words real default 1.0, w_meaning real default 1.0)
returns table (name text, kind text, summary text, inbound integer, fields integer, score real, by_words boolean, by_meaning boolean, snippet text)
language sql stable set search_path = public, extensions as $$
  with query as (select websearch_to_tsquery('english', q) as tsq),
  words as (
    select p.id, row_number() over (order by ts_rank(p.search, query.tsq) * (1 + ln(1 + p.inbound) / 4) desc) as r
    from pages p, query
    where p.search @@ query.tsq and p.name !~ ' > '
      and (p_kind is null or p.kind = p_kind)
      and (p_field is null or (p.fields & (1 << p_field)) <> 0)
    order by r limit 120
  ),
  meaning as (
    select p.id, row_number() over (order by p.embedding <=> q_embedding) as r
    from pages p
    where q_embedding is not null and p.embedding is not null and p.name !~ ' > '
      and (p_kind is null or p.kind = p_kind)
      and (p_field is null or (p.fields & (1 << p_field)) <> 0)
    order by p.embedding <=> q_embedding limit 120
  ),
  fused as (
    select coalesce(w.id, m.id) as id,
           (coalesce(w_words / (60 + w.r), 0) + coalesce(w_meaning / (60 + m.r), 0))::real as score,
           w.id is not null as by_words, m.id is not null as by_meaning
    from words w full join meaning m on w.id = m.id
    order by score desc
    limit least(greatest(p_limit, 1), 100)
  )
  select p.name, p.kind, p.summary, p.inbound, p.fields, f.score * (1 + ln(1 + p.inbound) / 12)::real, f.by_words, f.by_meaning,
         case when f.by_words then ts_headline('english', left(p.source, 30000), query.tsq, 'MaxFragments=1, MaxWords=30, MinWords=14, StartSel=⟦, StopSel=⟧') end
  from fused f join pages p on p.id = f.id, query
  order by f.score * (1 + ln(1 + p.inbound) / 12) desc;
$$;

-- Pages closest in meaning to this one
create or replace function public.related_pages(p_name text, p_limit integer default 8)
returns table (name text, kind text, summary text, inbound integer, similarity real)
language sql stable set search_path = public, extensions as $$
  -- nearest neighbours through the HNSW index first (fast), then the filters
  with me as (
    select id, embedding, kind from pages
    where id = (select id from pages where lower(name) = lower(btrim(p_name))
                union all select page_id from page_aliases where alias = lower(btrim(p_name)) limit 1)
  ),
  near as (
    select p.id, p.embedding <=> me.embedding as d
    from pages p, me
    where me.embedding is not null and p.embedding is not null
    order by p.embedding <=> (select embedding from me)
    limit 80
  )
  select p.name, p.kind, p.summary, p.inbound, (1 - n.d)::real
  from near n join pages p on p.id = n.id, me
  where p.id <> me.id and p.kind <> 's' and p.name !~ ' > ' and (p.kind <> 'p' or me.kind = 'p')  -- people only next to people
  order by n.d
  limit least(greatest(p_limit, 1), 30);
$$;

-- Loading embeddings (service key only: scripts/db-embed.mjs)
create or replace function public.import_embeddings(rows jsonb)
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare n integer;
begin
  update pages p set embedding = (r ->> 'embedding')::halfvec(384), embedded_at = now()
  from jsonb_array_elements(rows) r
  where lower(p.name) = lower(r ->> 'name');
  get diagnostics n = row_count;
  return n;
end $$;

-- Pages still without an embedding (new or edited on the site): for the embedding script
create or replace function public.pages_to_embed(p_limit integer default 1000)
returns table (name text, summary text, source text)
language sql stable security definer set search_path = public as $$
  select name, summary, left(source, 4000) from pages
  where embedding is null or embedded_at < updated_at
  order by inbound desc limit p_limit;
$$;

revoke all on function public.hybrid_search(text, extensions.halfvec, text, integer, integer, real, real), public.related_pages(text, integer),
                       public.import_embeddings(jsonb), public.pages_to_embed(integer) from public, anon, authenticated;
grant execute on function public.hybrid_search(text, extensions.halfvec, text, integer, integer, real, real), public.related_pages(text, integer) to anon, authenticated;
grant execute on function public.import_embeddings(jsonb), public.pages_to_embed(integer) to service_role;
