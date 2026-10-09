import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PayrollRow } from '@/features/payroll/payrollCsv';
import Payroll from './Payroll';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), business: { id: 'shop' }, role: 'owner', rows: [{ user_id: 'employee', full_name: 'Test Employee', email: 'person@example.test', shift_count: 2, scheduled_minutes: 905, annual_leave_days: 1, sickness_days: 2 }] as PayrollRow[] }));
vi.mock('@/features/auth/authContext', () => ({ useOptionalAuth: () => undefined, useAuth: () => ({ business: mocks.business, user: { id: 'owner' }, role: mocks.role, hasPermission: () => ['owner', 'admin'].includes(mocks.role) }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/features/payroll/payrollCsv', async importOriginal => ({ ...await importOriginal<typeof import('@/features/payroll/payrollCsv')>(), downloadPayroll: mocks.download }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.role = 'owner'; mocks.business = { id: 'shop' }; mocks.rpc.mockResolvedValue({ data: mocks.rows, error: null }); });
const show = () => render(<MemoryRouter><Payroll /></MemoryRouter>);
it('keeps headers during loading and disables export until data is ready', async () => {
  let finish!: (value: unknown) => void;
  mocks.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  show(); expect(screen.getByRole('columnheader', { name: 'Employee' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  await act(async () => finish({ data: mocks.rows, error: null }));
  expect(screen.getByText('Test Employee')).toBeVisible();
});
it('rechecks the database before downloading and prevents duplicate exports', async () => {
  show(); await screen.findByText('Test Employee');
  let finish!: (value: unknown) => void;
  mocks.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const button = screen.getByRole('button', { name: 'Download CSV' });
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'From date' })).toBeDisabled();
  await act(async () => finish({ data: [{ ...mocks.rows[0], scheduled_minutes: 60 }], error: null }));
  expect(mocks.download.mock.calls[0][0]).toContain('"1.00"');
  expect(mocks.download).toHaveBeenCalledTimes(1);
});
it.each(['reported', 'rejected'])('reports a %s export failure and allows retry', async kind => {
  show(); await screen.findByText('Test Employee');
  if (kind === 'reported') mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Export unavailable' } });
  else mocks.rpc.mockRejectedValueOnce(new Error('Export unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  await screen.findByText('Export unavailable'); expect(mocks.download).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download CSV' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
});
it('shows actionable data errors, with retry and no export', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Approved annual leave is missing its saved working pattern.' } });
  show(); await screen.findByText('Approved annual leave is missing its saved working pattern.');
  expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('Test Employee');
});
it('does not download empty data if the records disappeared after preview', async () => {
  show(); await screen.findByText('Test Employee'); mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  await screen.findByText('No published shifts or approved absence were found for this period.'); expect(mocks.download).not.toHaveBeenCalled();
});
it('ignores an export response after the workspace changes', async () => {
  const view = show(); await screen.findByText('Test Employee');
  let finish!: (value: unknown) => void; mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  mocks.business = { id: 'other-shop' }; view.rerender(<MemoryRouter><Payroll /></MemoryRouter>);
  await act(async () => finish({ data: mocks.rows, error: null })); expect(mocks.download).not.toHaveBeenCalled();
});
it('ignores an export response after navigating away', async () => {
  const view = show(); await screen.findByText('Test Employee');
  let finish!: (value: unknown) => void; mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' })); view.unmount();
  await act(async () => finish({ data: mocks.rows, error: null })); expect(mocks.download).not.toHaveBeenCalled();
});
