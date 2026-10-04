import { type Page } from '@playwright/test';
export const ownerId = '11111111-1111-4111-8111-111111111111';
export const employeeId = '22222222-2222-4222-8222-222222222222';
export const businessId = '33333333-3333-4333-8333-333333333333';
export const storeId = '44444444-4444-4444-8444-444444444444';
export const shiftId = '55555555-5555-4555-8555-555555555555';
export const user = { id: ownerId, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Test Owner', business_name: 'Test Shop' }, app_metadata: {}, created_at: '2026-01-01' };
export const business = { id: businessId, name: 'Test Shop', slug: 'test-shop', public_holidays_enabled: false };
export const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
export async function authenticate(page: Page) {
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session);
}
export type StubState = {
  hasWorkspace: boolean; role: 'owner' | 'employee'; holidayFailure: boolean; notificationFailure: boolean; readFailure: boolean; read: boolean;
  shifts: Record<string, unknown>[]; leaves: Record<string, unknown>[];
  writes: { endpoint: string; body: Record<string, unknown> }[];
};
export async function stubApi(page: Page) {
  const state: StubState = { hasWorkspace: true, role: 'owner', holidayFailure: false, notificationFailure: false, readFailure: false, read: false, shifts: [], leaves: [], writes: [] };
  await page.route('https://example.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop()!;
    const method = request.method();
    const body = request.postDataJSON() as Record<string, unknown> | null;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (method !== 'GET') state.writes.push({ endpoint, body: body ?? {} });
    if (url.pathname.includes('/auth/')) {
      if (endpoint === 'signup') return reply(user); // Email confirmation required: no session.
      if (endpoint === 'user') return reply(user);
      if (endpoint === 'token') return reply(session);
      if (endpoint === 'logout') return reply({});
    }
    const single = request.headers().accept?.includes('object+json');
    if (endpoint === 'profiles') return reply(single ? { full_name: 'Test Owner' } : url.searchParams.has('id') && url.searchParams.get('select') === 'full_name' ? [{ full_name: 'Test Owner' }] : [{ id: ownerId, full_name: 'Test Owner' }, { id: employeeId, full_name: 'Test Employee' }]);
    if (endpoint === 'memberships' && !state.hasWorkspace) return reply([]);
    if (endpoint === 'memberships') return reply(single ? { business_id: businessId, businesses: business } : url.searchParams.get('select')?.includes('businesses') ? [{ business_id: businessId, businesses: business }] : [{ user_id: employeeId }]);
    if (endpoint === 'user_roles') return reply([{ role: state.role }]);
    if (endpoint === 'business_branding') return reply(null);
    if (endpoint === 'custom_holidays') return state.holidayFailure ? reply({ message: 'Holiday service unavailable' }, 400) : reply([]);
    if (endpoint === 'notifications') {
      if (method === 'PATCH') {
        if (state.readFailure) return reply({ message: 'Save failed' }, 400);
        state.read = true;
        return reply([{ id: 'notification-1' }]);
      }
      if (state.notificationFailure) return reply({ message: 'Notifications unavailable' }, 400);
      return reply([{ id: 'notification-1', title: 'Schedule published', body: 'Your shifts are ready', read_at: state.read ? new Date().toISOString() : null, created_at: new Date().toISOString(), link: '/rota' }]);
    }
    if (endpoint === 'store_locations') return reply([{ id: storeId, name: 'Main Store', is_active: true }]);
    if (endpoint === 'employee_profiles') return reply([{ user_id: employeeId, working_days: [1, 2, 3, 4, 5], store_locations: { name: 'Main Store' } }]);
    if (endpoint === 'get_rota_people') return reply([{ id: employeeId, user_id: employeeId, full_name: 'Test Employee', primary_store_id: storeId, primary_role_id: null, store_ids: [storeId] }]);
    if (endpoint === 'shifts') {
      if (method === 'PATCH') {
        state.shifts = state.shifts.map(shift => ({ ...shift, ...body }));
        return reply([{ id: shiftId }]);
      }
      return reply(state.shifts);
    }
    if (endpoint === 'leave_requests') return reply(state.leaves);
    if (endpoint === 'get_leave_requests') return reply(state.leaves);
    if (endpoint === 'publish_rota_shifts') {
      state.shifts = state.shifts.map(shift => ({ ...shift, is_published: true }));
      return reply([{ published_count: state.shifts.length, notified_count: 1 }]);
    }
    if (endpoint === 'review_employee_leave') {
      state.leaves = state.leaves.map(leave => ({ ...leave, status: 'approved' }));
      return reply([{ id: state.leaves[0]?.id }]);
    }
    if (endpoint === 'get_invitation_by_token') return reply([{ id: 'invite-1', business_id: businessId, business_name: 'Test Shop', email: user.email, full_name: 'Test Owner', role: 'employee', status: 'pending', expires_at: '2099-01-01' }]);
    if (endpoint === 'accept_invitation') { state.role = 'employee'; return reply(businessId); }
    if (endpoint === 'bootstrap_business') { state.hasWorkspace = true; return reply(businessId); }
    if (['roles_catalog', 'leave_events', 'availability', 'audit_logs', 'invitations', 'employee_store_memberships'].includes(endpoint)) return reply([]);
    throw new Error(`Unstubbed API request: ${method} ${url.pathname}`);
  });
  return state;
}
