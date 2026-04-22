// Manager-only edge function that creates an invitation row.
// JWT is verified so we know who is calling. Service role is used to validate
// duplicate-membership in the SAME business (RLS would otherwise hide users
// in other businesses).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface Body {
  business_id: string;
  email: string;
  full_name?: string | null;
  role?: 'owner' | 'manager' | 'employee';
  primary_store_id?: string | null;
  primary_role_id?: string | null;
  contracted_hours?: number | null;
  hire_date?: string | null;
  phone?: string | null;
  notes?: string | null;
  redirect_origin?: string | null; // for building the accept-invite link
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const auth = req.headers.get('Authorization') ?? '';
    if (!auth) return json({ error: 'Not authenticated' }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: 'Not authenticated' }, 401);
    const caller = userRes.user;

    const body = (await req.json()) as Body;
    if (!body?.business_id) return json({ error: 'business_id is required' }, 400);
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email || !isEmail(email)) return json({ error: 'A valid email is required' }, 400);
    const role = body.role ?? 'employee';
    if (!['owner', 'manager', 'employee'].includes(role)) {
      return json({ error: 'Invalid role' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Caller must be manager/owner in this business.
    const { data: callerRoles } = await admin
      .from('user_roles')
      .select('role')
      .eq('business_id', body.business_id)
      .eq('user_id', caller.id);
    const callerRole = (callerRoles ?? []).map((r) => r.role);
    const isOwner = callerRole.includes('owner');
    const canManageStaff = isOwner || callerRole.includes('manager');
    if (!canManageStaff) return json({ error: 'Only owners and managers can invite employees' }, 403);
    if (role === 'owner' && !isOwner) {
      return json({ error: 'Only the owner can invite another owner' }, 403);
    }

    // Block: already a member of this business with this email.
    const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existingUser = existingUsers?.users.find(
      (u) => (u.email ?? '').toLowerCase() === email,
    );
    if (existingUser) {
      const { data: mem } = await admin
        .from('memberships')
        .select('id')
        .eq('business_id', body.business_id)
        .eq('user_id', existingUser.id)
        .maybeSingle();
      if (mem) {
        return json({ error: 'This person is already a member of your team.' }, 409);
      }
    }

    // Block: an open invite already exists.
    const { data: openInvite } = await admin
      .from('invitations')
      .select('id')
      .eq('business_id', body.business_id)
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle();
    if (openInvite) {
      return json({ error: 'An invite is already pending for this email.' }, 409);
    }

    // Mint token + insert
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const { data: inv, error: insErr } = await admin
      .from('invitations')
      .insert({
        business_id: body.business_id,
        email,
        full_name: body.full_name ?? null,
        role,
        primary_store_id: body.primary_store_id ?? null,
        primary_role_id: body.primary_role_id ?? null,
        contracted_hours: body.contracted_hours ?? null,
        hire_date: body.hire_date ?? null,
        phone: body.phone ?? null,
        notes: body.notes ?? null,
        token,
        invited_by: caller.id,
      })
      .select('id, token, expires_at, email, role')
      .single();
    if (insErr) return json({ error: insErr.message }, 400);

    const origin = body.redirect_origin || req.headers.get('origin') || '';
    const accept_url = origin ? `${origin}/accept-invite?token=${token}` : null;

    return json({ invitation: inv, accept_url });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Unknown error' }, 500);
  }
});
