// Manager-only: proposes draft shifts for a week from staffing needs using the Lovable AI Gateway.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'X-Lovable-AIG-Run-ID',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MODEL = 'openai/gpt-6-astra';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'shifts'],
  properties: {
    summary: { type: 'string' },
    shifts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['shift_date', 'start_time', 'end_time', 'role_id', 'assigned_user_id', 'break_minutes', 'reason'],
        properties: {
          shift_date: { type: 'string' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          role_id: { type: ['string', 'null'] },
          assigned_user_id: { type: ['string', 'null'] },
          break_minutes: { type: 'integer' },
          reason: { type: 'string' },
        },
      },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return json({ error: 'AI is not configured for this project.' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: 'Not signed in' }, 401);

  let body: { business_id?: string; store?: { id?: string; name?: string }; week_start?: string; days?: unknown[]; needs?: string; roles?: unknown[]; employees?: unknown[]; unavailable?: unknown[]; existing_shifts?: unknown[] };
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const { business_id, store, week_start, days, needs, roles, employees, unavailable, existing_shifts } = body ?? {};
  if (!business_id || !store?.id || !week_start || !needs) return json({ error: 'Missing staffing details' }, 400);

  const { data: allowed } = await sb.rpc('is_manager_or_owner', { _business_id: business_id, _user_id: user.id });
  if (!allowed) return json({ error: 'Only managers can generate rotas.' }, 403);

  const instructions = `You are a UK retail rota planner. Build a draft rota for one store for one week.
Rules:
- Meet the manager's staffing needs as closely as possible (coverage first).
- Only assign employees listed, using their exact user_id. Never assign someone on leave or marked unavailable at that time.
- Prefer employees whose primary role matches the shift role; use role_id values from the roles list only.
- Avoid overlapping shifts for one person, keep weekly hours near contracted hours, and spread hours fairly.
- If no suitable employee exists, set assigned_user_id to null (an open shift).
- Do not duplicate existing shifts already on the rota.
- Dates are YYYY-MM-DD within the given days; times are HH:MM 24h. break_minutes: 30 for shifts of 6h+, else 0.
- reason: max 12 words. summary: 2-3 sentences noting any coverage gaps.`;

  const input = JSON.stringify({ store, week_start, days, staffing_needs: needs, roles, employees, unavailable, existing_shifts });

  let upstream: Response;
  try {
    upstream = await fetch('https://ai.gateway.lovable.dev/v1/responses', {
      method: 'POST',
      signal: req.signal,
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': apiKey, 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({
        model: MODEL,
        instructions,
        input: [{ role: 'user', content: input }],
        stream: true,
        store: false,
        reasoning: { effort: 'medium', summary: 'auto' },
        include: ['reasoning.encrypted_content'],
        text: { format: { type: 'json_schema', name: 'rota_suggestion', strict: true, schema } },
      }),
    });
  } catch {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
    return json({ error: 'Could not reach the AI service.' }, 502);
  }

  const runId = upstream.headers.get('X-Lovable-AIG-Run-ID');
  const extra: Record<string, string> = runId ? { 'X-Lovable-AIG-Run-ID': runId } : {};
  const fail = (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, ...extra, 'Content-Type': 'application/json' } });

  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => '');
    let msg = 'The AI service returned an error.';
    try { msg = JSON.parse(t)?.error?.message ?? JSON.parse(t)?.message ?? msg; } catch { /* keep */ }
    if (upstream.status === 402) msg = msg || 'AI credits have run out.';
    if (upstream.status === 429) msg = 'The AI service is busy. Please try again in a minute.';
    return fail(msg, upstream.status);
  }

  // Consume the SSE stream and collect the final JSON text.
  const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '', text = '', errorMsg: string | null = null, refusal = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let ev: { type?: string; delta?: string; error?: { message?: string }; response?: { error?: { message?: string } } }; try { ev = JSON.parse(data); } catch { continue; }
        if (ev.type === 'response.output_text.delta') text += ev.delta ?? '';
        else if (ev.type === 'response.refusal.delta') refusal = true;
        else if (ev.type === 'error' || ev.type === 'response.failed') errorMsg = ev.error?.message ?? ev.response?.error?.message ?? 'AI request failed.';
      }
    }
  } catch {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
    return fail('The AI response was interrupted.', 502);
  }

  if (errorMsg) return fail(errorMsg, 502);
  if (refusal || !text) return fail('The AI could not produce a rota for this request.', 422);
  try {
    return new Response(text, { status: 200, headers: { ...corsHeaders, ...extra, 'Content-Type': 'application/json' } });
  } catch {
    return fail('Unexpected AI response.', 502);
  }
});
