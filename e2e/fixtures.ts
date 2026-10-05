import { type Page } from '@playwright/test';
export const ownerId = '11111111-1111-4111-8111-111111111111';
export const employeeId = '22222222-2222-4222-8222-222222222222';
export const businessId = '33333333-3333-4333-8333-333333333333';
export const storeId = '44444444-4444-4444-8444-444444444444';
export const shiftId = '55555555-5555-4555-8555-555555555555';
export const user = { id: ownerId, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Test Owner', business_name: 'Test Shop' }, app_metadata: {}, created_at: '2026-01-01' };
export const business = { id: businessId, name: 'Test Shop', slug: 'test-shop', public_holidays_enabled: false };
export const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
export async function authenticate(page: Page, personId = ownerId) {
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify({ ...value, expires_at: Math.floor(Date.now() / 1000) + 3600 })), { ...session, user: { ...user, id: personId, email: personId === ownerId ? user.email : 'employee@example.test' } });
}
export type StubState = {
  logoutFailure: boolean; passwordFailure: boolean; recoveryFailure: boolean; inviteFailure: boolean; inviteUpdateFailure: boolean; memberFailure: boolean; editFailure: boolean; employeeActive: boolean; employeeRole: 'employee' | 'manager'; hours: number; invites: Record<string, unknown>[];
  hasWorkspace: boolean; role: 'owner' | 'employee'; holidayFailure: boolean; notificationFailure: boolean; readFailure: boolean; read: boolean;
  shiftFailure: string | null; holidays: Record<string, unknown>[]; batches: Record<string, unknown>[][]; shifts: Record<string, unknown>[]; leaves: Record<string, unknown>[];
  writes: { endpoint: string; body: Record<string, unknown> }[];
};
export async function stubApi(page: Page, shared?: StubState) {
  const state: StubState = shared ?? { logoutFailure: false, passwordFailure: false, recoveryFailure: false, inviteFailure: false, inviteUpdateFailure: false, memberFailure: false, editFailure: false, employeeActive: true, employeeRole: 'employee', hours: 20, invites: [], hasWorkspace: true, role: 'owner', holidayFailure: false, notificationFailure: false, readFailure: false, read: false, shiftFailure: null, holidays: [], batches: [], shifts: [], leaves: [], writes: [] };
  await page.route('https://example.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop()!;
    const method = request.method();
    const rawBody = request.postDataJSON() as Record<string, unknown> | Record<string, unknown>[] | null;
    const body = Array.isArray(rawBody) ? null : rawBody;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (method !== 'GET') state.writes.push({ endpoint, body: body ?? {} });
    if (url.pathname.includes('/auth/')) {
      if (endpoint === 'signup') return reply(user); // Email confirmation required: no session.
      if (endpoint === 'user') {
        if (method === 'PUT' && state.passwordFailure) return reply({ msg: 'Password update failed' }, 400);
        return reply(user);
      }
      if (endpoint === 'recover') return state.recoveryFailure ? reply({ msg: 'Too many requests' }, 429) : reply({});
      if (endpoint === 'token') return reply(session);
      if (endpoint === 'logout') return state.logoutFailure ? reply({ msg: 'Sign-out failed' }, 400) : reply({});
    }
    const single = request.headers().accept?.includes('object+json');
    if (endpoint === 'profiles' && url.searchParams.get('select') === 'phone') return reply(single ? { phone: null } : [{ phone: null }]);
    if (endpoint === 'profiles') return reply(single ? { full_name: 'Test Owner' } : url.searchParams.has('id') && url.searchParams.get('select') === 'full_name' ? [{ full_name: 'Test Owner' }] : [{ id: ownerId, full_name: 'Test Owner' }, { id: employeeId, full_name: 'Test Employee' }]);
    if (endpoint === 'memberships' && method === 'PATCH') {
      if (state.memberFailure) return reply({ message: 'Employee access update failed' }, 400);
      state.employeeActive = body?.is_active === true;
      return reply([{ user_id: employeeId }]);
    }
    if (endpoint === 'memberships' && url.searchParams.get('user_id') === `eq.${employeeId}` && !state.employeeActive) return reply([]);
    if (endpoint === 'memberships' && !state.hasWorkspace) return reply([]);
    if (endpoint === 'memberships') return reply(single ? { business_id: businessId, businesses: business } : url.searchParams.get('select')?.includes('businesses') ? [{ business_id: businessId, businesses: business }] : [{ user_id: employeeId, is_active: state.employeeActive }]);
    if (endpoint === 'user_roles') return url.searchParams.get('select')?.includes('user_id') ? reply([{ user_id: employeeId, role: state.employeeRole }]) : reply([{ role: url.searchParams.get('user_id') === `eq.${employeeId}` ? state.employeeRole : state.role }]);
    if (endpoint === 'business_branding') return reply(null);
    if (endpoint === 'custom_holidays') return state.holidayFailure ? reply({ message: 'Holiday service unavailable' }, 400) : reply(state.holidays);
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
    if (endpoint === 'employee_profiles') return reply([{ user_id: employeeId, working_days: [1, 2, 3, 4, 5], primary_store_id: storeId, primary_role_id: null, contracted_hours: state.hours, annual_leave_entitlement: 28, store_locations: { name: 'Main Store' } }]);
    if (endpoint === 'invite-employee') {
      if (state.inviteFailure) return reply({ error: 'Could not create the invitation' });
      state.invites.push({ id: '77777777-7777-4777-8777-777777777777', ...body, status: 'pending', expires_at: '2099-01-01', token: 'test-created-invite' });
      return reply({ accept_url: 'http://127.0.0.1:4174/accept-invite?token=test-created-invite' });
    }
    if (endpoint === 'invitations') {
      if (method === 'PATCH') {
        if (state.inviteUpdateFailure) return reply({ message: 'Invite update failed' }, 400);
        state.invites = state.invites.map(invite => ({ ...invite, ...body }));
        return reply(state.invites.map(invite => ({ id: invite.id })));
      }
      return reply(state.invites);
    }
    if (endpoint === 'update_team_member') {
      if (state.editFailure) return reply({ message: 'Employment update failed' }, 400);
      if (body?._role) state.employeeRole = body._role as 'employee' | 'manager';
      state.hours = Number(body?._contracted_hours);
      return reply(null);
    }
    if (endpoint === 'get_rota_people') return reply([{ id: employeeId, user_id: employeeId, full_name: 'Test Employee', primary_store_id: storeId, primary_role_id: null, store_ids: [storeId] }]);
    const matchingShifts = () => state.shifts.filter(shift => [...url.searchParams].every(([key, filter]) => {
      const [op, ...parts] = filter.split('.'); const value = parts.join('.');
      if (!['eq', 'neq', 'gte', 'lte'].includes(op)) return true;
      const actual = String(shift[key]);
      return op === 'eq' ? actual === value : op === 'neq' ? actual !== value : op === 'gte' ? actual >= value : actual <= value;
    }));
    if (endpoint === 'release_coverage_shifts') {
      const versions = body?._shifts as { id: string; updated_at: string }[];
      const current = versions.map(version => state.shifts.find(shift => shift.id === version.id));
      if (current.some((shift, index) => !shift || shift.updated_at !== versions[index].updated_at || shift.status === 'cancelled')) {
        return reply({ message: 'Coverage has changed. Refresh coverage and try again.' }, 400);
      }
      current.forEach(shift => Object.assign(shift!, { assigned_user_id: null, status: 'unassigned', updated_at: '2026-10-05T14:00:00Z' }));
      return reply(current.length);
    }
    if (endpoint === 'move_rota_shift') {
      if (state.shiftFailure) return reply({ message: state.shiftFailure }, 400);
      const source = state.shifts.find(shift => shift.id === body?._shift_id)!;
      const target = state.shifts.find(shift => shift.id === body?._swap_shift_id);
      if (source.updated_at !== body?._expected_updated_at || (target && target.updated_at !== body?._swap_expected_updated_at)) return reply({ message: 'Shift has changed. Refresh the rota.' }, 400);
      const original = { assigned_user_id: source.assigned_user_id, shift_date: source.shift_date };
      Object.assign(source, { assigned_user_id: body?._assigned_user_id, shift_date: body?._shift_date });
      if (target) Object.assign(target, original);
      return reply(null);
    }
    if (endpoint === 'shifts') {
      if (method === 'POST') {
        if (state.shiftFailure) return reply({ message: state.shiftFailure }, 400);
        const rows = Array.isArray(rawBody) ? rawBody : [body ?? {}];
        state.batches.push(rows);
        state.shifts.push(...rows.map((row, index) => ({ ...row, id: `copied-${index}`, updated_at: '2026-10-05T12:00:00Z' })));
        return reply(null, 201);
      }
      if (method === 'PATCH') {
        if (state.shiftFailure) return reply({ message: state.shiftFailure }, 400);
        const matches = matchingShifts();
        matches.forEach(shift => Object.assign(shift, body));
        return reply(matches.map(shift => ({ id: shift.id })));
      }
      return reply(matchingShifts());
    }
    if (endpoint === 'leave_requests') {
      if (method === 'POST') {
        state.leaves.push({ ...body, id: '66666666-6666-4666-8666-666666666666', status: 'pending', created_at: '2026-10-04', sickness_meta: null, lifecycle_status: null });
        return reply(null, 201);
      }
      return reply(state.leaves);
    }
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
