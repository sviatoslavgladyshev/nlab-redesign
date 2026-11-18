// Smart search for the nLab site (Supabase Edge Function "search").
// Turns the question into an embedding with gte-small (built into Supabase: no API key, no cost),
// then asks the database for the best pages by meaning and by words (hybrid_search in rag.sql).
//
// POST { q: string, kind?: 'c'|'t'|'p'|'r', field?: number, limit?: number }
//  →   [{ name, kind, summary, inbound, fields, score, by_words, by_meaning, snippet }]
//
// POST { embed: "Page name" }  →  { embedded: true|false }
//   Keeps smart search up to date as pages are added and edited: the site calls this after publishing.
//   Only pages whose embedding is missing or older than their last edit are (re)computed.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → Via editor → name it "search",
// paste this file, deploy; then in its settings turn OFF "Verify JWT" (the search is public).
// Or with the CLI: npx supabase functions deploy search --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

// @ts-ignore Supabase.ai is provided by the Edge Runtime
const model = new Supabase.ai.Session('gte-small');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
  { auth: { persistSession: false } },
);

// for writing embeddings (the service key is provided to Edge Functions by Supabase, never to the site)
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

// what the model reads for a page: title, summary and the start of the text, without markup
// (the same as scripts/db-embed.mjs)
const plain = (src: string) => src
  .replace(/^\s*\+--[\s\S]*?\n=--\s*$/gm, ' ')
  .replace(/\[\[!\w+[^\]]*\]\]/g, ' ').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\{[:#][^}]*\}/g, ' ').replace(/^#+\s*/gm, '').replace(/[*_`>|]+/g, '')
  .replace(/\\(mathbb|mathcal|mathrm|mathbf|text|operatorname)\{([^}]*)\}/g, '$2').replace(/\\[a-zA-Z]+/g, ' ').replace(/[$^{}]/g, ' ')
  .replace(/\b(table of contents|toc|Contents|Idea|Definition|Properties|Examples|References|Related concepts)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

async function embedPage(name: string) {
  const { data: page, error } = await admin.from('pages')
    .select('name, summary, source, embedded_at, updated_at, has: embedding')
    .ilike('name', name.replace(/[%_\\]/g, (c) => `\\${c}`)).limit(1).maybeSingle();
  if (error) throw error;
  if (!page) return false;
  if (page.has && page.embedded_at && page.embedded_at >= page.updated_at) return false; // already current
  const text = `${page.name}. ${page.summary || ''} ${plain((page.source || '').slice(0, 4000)).slice(0, 1200)}`.slice(0, 1600);
  const v = await model.run(text, { mean_pool: true, normalize: true });
  const { error: e2 } = await admin.rpc('import_embeddings', { rows: [{ name: page.name, embedding: `[${Array.from(v as number[]).join(',')}]` }] });
  if (e2) throw e2;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  try {
    const body = await req.json();
    if (typeof body.embed === 'string') return json({ embedded: await embedPage(body.embed.slice(0, 300)) });
    const { q = '', kind = null, field = null, limit = 40 } = body;
    const query = String(q).slice(0, 400).trim();
    if (!query) return json([]);
    // the meaning of the question, without the search operators
    const text = query.replace(/\b(title|summary|kind|type|name|text):("[^"]*"|\S+)/gi, ' ')
      .replace(/(^|\s)-\S+/g, ' ').replace(/\b(AND|OR|NOT)\b/g, ' ').replace(/["()*]/g, ' ').replace(/\s+/g, ' ').trim();
    const embedding = text ? await model.run(text, { mean_pool: true, normalize: true }) : null;
    const words = query.replace(/\b(title|summary|kind|type|name|text):/gi, '').replace(/\bNOT\s+/g, '-').replace(/\bAND\b/g, ' ').replace(/[()*]/g, ' ');
    const { data, error } = await db.rpc('hybrid_search', {
      q: words,
      q_embedding: embedding ? `[${Array.from(embedding as number[]).join(',')}]` : null,
      p_kind: kind,
      p_field: Number.isInteger(field) ? field : null,
      p_limit: Math.min(Math.max(+limit || 40, 1), 100),
    });
    if (error) throw error;
    return json(data);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
