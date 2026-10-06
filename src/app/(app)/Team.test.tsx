import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Team from './Team';
const mocks = vi.hoisted(() => ({ owner: true, business: { id: 'shop' }, user: { id: 'owner' }, rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/features/auth/authContext', () => ({ useAuth: () => ({ business: mocks.business, user: mocks.user, hasPermission: (permission: string) => permission === 'manage_settings' ? mocks.owner : true }) }));
vi.mock('@/features/leave/useLeaveRequests', () => ({ useLeaveRequests: () => ({ addForEmployee: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
// Menu mechanics have separate browser coverage; keep these tests focused on employee editing.
vi.mock('@/components/ui/dropdown-menu', () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { DropdownMenu: Wrapper, DropdownMenuTrigger: Wrapper, DropdownMenuContent: Wrapper, DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({ children, onSelect, disabled }: { children: ReactNode; onSelect: () => void; disabled?: boolean }) => <button role="menuitem" disabled={disabled} onClick={onSelect}>{children}</button>,
  };
});
vi.mock('@/integrations/supabase/client', () => {
  const rows: Record<string, unknown[]> = {
    user_roles: [{ user_id: 'employee', role: 'employee' }], profiles: [{ id: 'employee', full_name: 'Test Employee' }],
    employee_profiles: [{ user_id: 'employee', contracted_hours: 20, primary_store_id: 'store', primary_role_id: null, working_days: [1, 3, 5], annual_leave_entitlement: 28 }],
    store_locations: [{ id: 'store', name: 'Main store' }], roles_catalog: [], invitations: [], memberships: [{ user_id: 'employee', is_active: true }],
  };
  return { supabase: { rpc: mocks.rpc, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn(), from: (table: string) => {
    const response = Promise.resolve({ data: rows[table] ?? [], error: null });
    const query = { select: () => query, eq: () => query, order: () => query, then: response.then.bind(response) };
    return query;
  } } };
});
beforeEach(() => { vi.clearAllMocks(); mocks.owner = true; mocks.rpc.mockResolvedValue({ data: null, error: null }); });
afterEach(cleanup);
async function edit() {
  render(<MemoryRouter><Team /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit details' }));
  return screen.getByRole('dialog', { name: 'Edit Test Employee' });
}
it.each(['reported', 'rejected'])('retains draft role and hours after a %s save failure and retries', async kind => {
  if (kind === 'reported') mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Employment update failed' } });
  else mocks.rpc.mockRejectedValueOnce(new Error('Employment update failed'));
  const dialog = await edit();
  fireEvent.change(dialog.querySelector('select')!, { target: { value: 'manager' } });
  fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '30' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  await within(dialog).findByText('Employment update failed');
  expect(dialog.querySelector('select')).toHaveValue('manager');
  expect(within(dialog).getByRole('spinbutton')).toHaveValue(30);
  expect(mocks.success).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(mocks.rpc).toHaveBeenLastCalledWith('update_team_member', expect.objectContaining({ _role: 'manager', _contracted_hours: 30, _business_id: 'shop', _user_id: 'employee' }));
});
it('keeps role unchanged when a manager edits employment details', async () => {
  mocks.owner = false; const dialog = await edit();
  expect(dialog.querySelector('select')).toBeDisabled();
  fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '25' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Employee updated'));
  expect(mocks.rpc).toHaveBeenCalledWith('update_team_member', expect.objectContaining({ _role: null, _contracted_hours: 25 }));
});
it.each([-1, 169])('blocks invalid contracted hours: %i', async hours => {
  const dialog = await edit(); fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: String(hours) } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  await within(dialog).findByText('Contracted hours must be between 0 and 168'); expect(mocks.rpc).not.toHaveBeenCalled();
});
it('requires a working pattern before saving employment changes', async () => {
  const dialog = await edit();
  within(dialog).getAllByRole('checkbox').filter(input => (input as HTMLInputElement).checked).forEach(input => fireEvent.click(input));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  await within(dialog).findByText('Select at least one normal working day for leave calculations'); expect(mocks.rpc).not.toHaveBeenCalled();
});
it('requires a primary store rather than writing an empty store ID', async () => {
  const dialog = await edit(); fireEvent.change(dialog.querySelectorAll('select')[1], { target: { value: '' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  await within(dialog).findByText('Pick a primary store'); expect(mocks.rpc).not.toHaveBeenCalled();
});
it('allows blank optional hours and sends null rather than zero', async () => {
  const dialog = await edit(); fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalled());
  expect(mocks.rpc).toHaveBeenCalledWith('update_team_member', expect.objectContaining({ _contracted_hours: null, _primary_role_id: null }));
});
it('prevents duplicate employee saves submitted in the same event', async () => {
  let finish!: (value: { data: null; error: null }) => void;
  mocks.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const dialog = await edit(), form = dialog.querySelector('form')!;
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await act(async () => finish({ data: null, error: null }));
  expect(mocks.success).toHaveBeenCalledTimes(1);
});
