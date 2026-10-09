import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ShiftChanges from './ShiftChanges';
import type { ShiftChangeRequest } from '@/features/rota/shiftChangeTypes';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), query: vi.fn(), business: { id: 'shop' }, user: { id: 'employee' }, role: 'employee' }));
vi.mock('@/features/auth/authContext', () => ({ useAuth: () => ({ business: mocks.business, user: mocks.user, role: mocks.role, hasPermission: () => mocks.role === 'owner' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: () => { const builder = { select: () => builder, eq: () => builder, neq: () => builder, gte: () => builder, order: () => builder, range: mocks.query }; return builder; } } }));
const details = { id: 'shift', date: '2099-11-02', start: '09:00:00', end: '17:00:00', break_minutes: 30, store: 'Main Store', role: null, starts_at: '2099-11-02T09:00:00Z' };
const request: ShiftChangeRequest = { id: 'request', requester_id: 'employee', requester_name: 'Employee', replacement_user_id: 'colleague', replacement_name: 'Colleague', reason: 'Need cover', manager_note: null, warnings: [], status: 'proposed', source: details, swap: null, requester_accepted: false, replacement_accepted: false, created_at: '2026-10-09T10:00:00Z', updated_at: '2026-10-09T10:00:00Z' };
const ownShift = { id: 'other-shift', assigned_user_id: 'employee', shift_date: '2099-11-03', start_time: '09:00:00', end_time: '17:00:00' };
let rows: ShiftChangeRequest[];
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.business = { id: 'shop' }; mocks.role = 'employee'; mocks.user = { id: 'employee' }; rows = [request]; mocks.query.mockResolvedValue({ data: [ownShift], error: null }); mocks.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === 'get_shift_change_requests' ? rows : name === 'get_rota_people' ? [{ user_id: 'colleague', full_name: 'Colleague' }] : 'request', error: null })); });
const show = () => render(<MemoryRouter><ShiftChanges /></MemoryRouter>);
it('shows only employee actions and sends the reviewed proposal version when accepting', async () => {
 show(); await screen.findByText('Waiting for employees'); expect(screen.queryByRole('button', { name: 'Confirm change' })).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button', { name: 'Accept proposal' }));
 await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('change_shift_request', expect.objectContaining({ _action: 'accept', _request_id: 'request', _expected_updated_at: request.updated_at })));
});
it('already accepted employees wait for the colleague rather than accepting again', async () => {
 rows = [{ ...request, requester_accepted: true }]; show(); await screen.findByText('Waiting for employees'); expect(screen.queryByRole('button', { name: 'Accept proposal' })).not.toBeInTheDocument();
});
it('management confirmation appears only after both acceptances', async () => {
 mocks.role = 'owner'; rows = [{ ...request, status: 'ready', requester_accepted: true, replacement_accepted: true, warnings: ['Check rest gap'] }];
 show(); await screen.findByText('Both employees have accepted. Review the arrangement and confirm the change.'); expect(screen.getByText('Check rest gap')).toBeVisible();
 fireEvent.click(screen.getByRole('button', { name: 'Confirm change' })); await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('change_shift_request', expect.objectContaining({ _action: 'confirm' })));
});
it('creates a request from a selected own shift with a private explanation', async () => {
 show(); await screen.findByText('Waiting for employees'); fireEvent.click(screen.getByRole('button', { name: 'Request a shift change' }));
 fireEvent.change(screen.getByLabelText('What change do you need?'), { target: { value: 'Can work Thursday instead' } });
 fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
 await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('change_shift_request', expect.objectContaining({ _action: 'create', _shift_id: 'other-shift', _reason: 'Can work Thursday instead' })));
});
it.each(['reported', 'rejected'])('shows %s write failures and releases busy controls', async kind => {
 show(); await screen.findByText('Waiting for employees');
 mocks.rpc.mockImplementationOnce(() => kind === 'reported' ? Promise.resolve({ data: null, error: { message: 'Shift changed' } }) : Promise.reject(new Error('Shift changed')));
 fireEvent.click(screen.getByRole('button', { name: 'Accept proposal' })); await screen.findByRole('alert');
 await waitFor(() => expect(screen.getByRole('button', { name: 'Accept proposal' })).toBeEnabled());
});
it('prevents duplicate acceptance while the mutation is pending', async () => {
 show(); await screen.findByText('Waiting for employees'); let finish!: (value: unknown) => void;
 mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 const button = screen.getByRole('button', { name: 'Accept proposal' }); act(() => { fireEvent.click(button); fireEvent.click(button); });
 expect(mocks.rpc.mock.calls.filter(([name]) => name === 'change_shift_request')).toHaveLength(1);
 await act(async () => finish({ data: 'request', error: null }));
});
it('displays retry after failed loading instead of an empty request list', async () => {
 mocks.rpc.mockRejectedValueOnce(new Error('offline')); show(); await screen.findByRole('alert'); expect(screen.queryByText('No shift changes')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button', { name: 'Try again' })); await screen.findByText('Waiting for employees');
});
it('expired requests have no acceptance or confirmation actions', async () => {
 rows = [{ ...request, status: 'expired' }]; show(); await screen.findByText('No active shift changes'); fireEvent.click(screen.getByRole('button', { name: /History/ })); await screen.findByText('Expired'); expect(screen.queryByRole('button', { name: 'Accept proposal' })).not.toBeInTheDocument();
});

it('separates closed history and keeps request details behind explicit disclosure', async () => {
 rows = [request, { ...request, id: 'closed', status: 'completed' }]; show(); await screen.findByText('Waiting for employees');
 expect(screen.queryByText('Confirmed')).not.toBeInTheDocument();
 expect(screen.getByText('Need cover').closest('details')).not.toHaveAttribute('open');
 fireEvent.click(screen.getByRole('button', { name: /History/ })); await screen.findByText('Confirmed');
 expect(screen.queryByRole('button', { name: 'Accept proposal' })).not.toBeInTheDocument();
 expect(screen.getByText('This change has been confirmed and the rota updated.')).toBeVisible();
});
it('shows both shift assignments for a swap without confusing cover with exchange', async () => {
 rows = [{ ...request, swap: { ...details, id: 'swap', date: '2099-11-04' } }]; show(); await screen.findByText('Proposed exchange');
 expect(screen.getByText('Colleague takes this shift')).toBeVisible(); expect(screen.getByText('Employee takes this shift')).toBeVisible();
 expect(screen.queryByText('Proposed cover')).not.toBeInTheDocument();
});
it('managers waiting for employees see named next steps and cannot confirm', async () => {
 mocks.role = 'owner'; mocks.user = { id: 'manager' }; show(); await screen.findByText('Waiting for employees');
 expect(screen.getByText('Waiting for Employee and Colleague. You can confirm once both have accepted.')).toBeVisible();
 expect(screen.queryByRole('button', { name: 'Confirm change' })).not.toBeInTheDocument();
});
