import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Rota from './Rota';
import Team from './Team';
import Dashboard from './Dashboard';
const mocks = vi.hoisted(() => ({
  business: { id: 'shop', name: 'Shop' }, user: { id: 'self' }, query: 0, failure: null as number | null, reject: false, manager: true,
}));
vi.mock('@/features/auth/authContext', () => ({
  useOptionalAuth: () => undefined,
  useAuth: () => ({ business: mocks.business, user: mocks.user, role: mocks.manager ? 'owner' : 'employee', fullName: 'Person', hasPermission: () => mocks.manager }),
}));
vi.mock('@/features/holidays/useHolidays', () => ({ useHolidays: () => ({ enabled: false, inRange: () => [], get: () => null, getBlocking: () => null }) }));
vi.mock('@/features/notifications/useNotifications', () => ({ useNotifications: () => ({ items: [] }) }));
vi.mock('@/features/leave/useLeaveRequests', () => ({ useLeaveRequests: () => ({ addForEmployee: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => {
  const query = () => {
    const response = async () => {
      const index = mocks.query++;
      if (mocks.failure === index && mocks.reject) throw new Error('Offline');
      return mocks.failure === index ? { data: null, error: { message: 'Denied' } } : { data: [], error: null };
    };
    const chain = {
      select: () => chain, eq: () => chain, neq: () => chain, gte: () => chain, lte: () => chain,
      order: () => chain, limit: () => chain, not: () => chain, in: () => chain,
      then: <T,>(resolve: (value: Awaited<ReturnType<typeof response>>) => T, reject: (reason: unknown) => T) => response().then(resolve, reject),
    };
    return chain;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { from: query, rpc: query, channel: () => channel, removeChannel: vi.fn() } };
});
afterEach(cleanup);
beforeEach(() => { mocks.query = 0; mocks.failure = null; mocks.reject = false; mocks.manager = true; });
const cases = [
  { name: 'rota', component: Rota, queries: 5, heading: /Week of/, manager: true },
  { name: 'team', component: Team, queries: 7, heading: 'Your people', manager: true },
  { name: 'manager dashboard', component: Dashboard, queries: 6, heading: /Good (morning|afternoon|evening), Person/, manager: true },
  { name: 'employee dashboard', component: Dashboard, queries: 3, heading: /Good (morning|afternoon|evening), Person/, manager: false },
];
for (const page of cases) {
  describe(`${page.name} loading`, () => {
    it.each(Array.from({ length: page.queries }, (_, i) => i))('shows retry instead of partial/empty data when query %i fails', async (index) => {
      mocks.failure = index; mocks.manager = page.manager;
      const Page = page.component;
      render(<MemoryRouter><Page /></MemoryRouter>);
      await screen.findByRole('alert');
      expect(screen.getByRole('heading', { name: page.heading })).toBeInTheDocument();
      expect(screen.queryByText(/No shifts this week|No upcoming shifts|No team yet/)).not.toBeInTheDocument();
      mocks.failure = null;
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await screen.findByRole('heading', { name: page.heading });
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });
    it('handles rejected network requests with the same retryable error', async () => {
      mocks.failure = 0; mocks.reject = true; mocks.manager = page.manager;
      const Page = page.component;
      render(<MemoryRouter><Page /></MemoryRouter>);
      await screen.findByRole('alert');
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
  });
}
