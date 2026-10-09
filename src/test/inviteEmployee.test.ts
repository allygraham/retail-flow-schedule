import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  activeMember: false as boolean | null, membership: true, role: 'manager', lookupError: false,
  pendingError: false, dsn: undefined as string | undefined, sentryInit: vi.fn(), captureMessage: vi.fn(), flush: vi.fn().mockResolvedValue(true), rpc: vi.fn(), inserted: vi.fn(), listUsers: vi.fn(),
}));
vi.mock('npm:@sentry/deno@11.6.0', () => ({ init: mocks.sentryInit, captureMessage: mocks.captureMessage, flush: mocks.flush }));
vi.mock('https://esm.sh/@supabase/supabase-js@2.45.0', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'caller' } }, error: null }), admin: { listUsers: mocks.listUsers } },
  rpc: async (name: string, args: unknown) => {
    mocks.rpc(name, args);
    return { data: mocks.activeMember, error: mocks.lookupError ? { message: 'Offline' } : null };
  },
  from: (table: string) => {
    let inserted = false;
    const chain = {
      select: () => chain, eq: () => chain,
      insert: (body: unknown) => { inserted = true; mocks.inserted(body); return chain; },
      maybeSingle: async () => table === 'memberships'
        ? { data: mocks.membership ? { id: 'membership' } : null, error: null }
        : { data: null, error: mocks.pendingError ? { message: 'Offline' } : null },
      single: async () => ({ data: inserted ? { id: 'invite', token: 'new-token' } : null, error: null }),
      then: (resolve: (result: unknown) => void) => resolve({ data: [{ role: mocks.role }], error: null }),
    };
    return chain;
  },
}) }));
let handle: (req: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
  vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'SENTRY_DSN' ? mocks.dsn : 'test-only' }, serve: (fn: typeof handle) => { handle = fn; } });
  const entry = '../../supabase/functions/invite-employee/index.ts';
  await import(entry);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.dsn = undefined; mocks.flush.mockResolvedValue(true);
  mocks.activeMember = false; mocks.membership = true; mocks.role = 'manager';
  mocks.lookupError = false; mocks.pendingError = false;
});
const send = (patch = {}) => handle(new Request('https://example.test/invite-employee', {
  method: 'POST', headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json' },
  body: JSON.stringify({ business_id: 'shop', email: ' Employee@Example.Test ', role: 'employee', ...patch }),
}));
it('allows invitations for inactive or new members using an exact normalized email lookup', async () => {
  expect((await send()).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith('has_active_team_email', { _business_id: 'shop', _email: 'employee@example.test' });
  expect(mocks.listUsers).not.toHaveBeenCalled();
  expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ business_id: 'shop', email: 'employee@example.test' }));
});
it('blocks active team members without creating another invitation', async () => {
  mocks.activeMember = true;
  expect((await send()).status).toBe(409);
  expect(mocks.inserted).not.toHaveBeenCalled();
});
it.each(['lookupError', 'pendingError'] as const)('fails closed when %s occurs', async key => {
  mocks[key] = true;
  expect((await send()).status).toBe(500);
  expect(mocks.inserted).not.toHaveBeenCalled();
});
it('inactive callers and employees cannot use the service-role invitation flow', async () => {
  mocks.membership = false;
  expect((await send()).status).toBe(403);
  mocks.membership = true; mocks.role = 'employee';
  expect((await send()).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.inserted).not.toHaveBeenCalled();
});
it('managers cannot invite owners', async () => {
  expect((await send({ role: 'owner' })).status).toBe(403);
  expect(mocks.inserted).not.toHaveBeenCalled();
});

it('requires an explicit membership lookup result before creating an invite', async () => {
  mocks.activeMember = null;
  expect((await send()).status).toBe(500);
  expect(mocks.inserted).not.toHaveBeenCalled();
});

it('reports configured server failures with only a generic invitation message', async () => {
 mocks.dsn = 'https://public@o0.ingest.sentry.io/1'; mocks.lookupError = true; expect((await send()).status).toBe(500);
 expect(mocks.captureMessage).toHaveBeenCalledWith('Employee invitation function failed', 'error');
 const filter = mocks.sentryInit.mock.calls[0][0].beforeSend;
 const event = filter({ user: { email: 'private@example.test' }, request: { data: 'medical detail' }, message: 'private', extra: { token: 'secret' } });
 expect(JSON.stringify(event)).not.toMatch(/private|medical|secret/);
});
it('a Sentry delivery failure preserves the original API error response', async () => {
 mocks.dsn = 'https://public@o0.ingest.sentry.io/1'; mocks.lookupError = true; mocks.flush.mockRejectedValueOnce(new Error('offline'));
 expect((await send()).status).toBe(500);
});
