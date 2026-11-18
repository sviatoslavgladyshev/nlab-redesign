// Smart search for the nLab site (Supabase Edge Function "search").
// Turns the question into an embedding with gte-small (built into Supabase: no API key, no cost),
// then asks the database for the best pages by meaning and by words (hybrid_search in rag.sql).
//
// POST { q: string, kind?: 'c'|'t'|'p'|'r', field?: number, limit?: number }
//  →   [{ name, kind, summary, inbound, fields, score, by_words, by_meaning, snippet }]
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  try {
    const { q = '', kind = null, field = null, limit = 40 } = await req.json();
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
