import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RolesSettings } from '@/features/roles/RolesSettings';
import { BrandingSettings } from '@/features/branding/BrandingSettings';
import { HolidaySettings } from '@/features/holidays/HolidaySettings';
import Stores from '@/app/(app)/Stores';
import { DEFAULT_THEME } from '@/features/branding/types';
const mocks = vi.hoisted(() => ({
  business: { id: 'shop', public_holidays_enabled: true, public_holidays_region: 'england' }, user: { id: 'owner' },
  read: vi.fn(), write: vi.fn(), success: vi.fn(), error: vi.fn(), refresh: vi.fn(), preview: vi.fn(), clear: vi.fn(),
}));
vi.mock('@/features/auth/authContext', () => ({ useAuth: () => ({ business: mocks.business, user: mocks.user, role: 'owner', hasPermission: () => true, refresh: mocks.refresh }) }));
vi.mock('@/features/branding/brandingContext', async importOriginal => ({ ...(await importOriginal<object>()), useBranding: () => ({ theme: DEFAULT_THEME, savedTheme: DEFAULT_THEME, refresh: mocks.refresh, previewTheme: mocks.preview, clearPreviewTheme: mocks.clear }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  let method = 'read'; let payload: unknown;
  const q = { select: () => q, eq: () => q, order: () => q,
    insert: (value: unknown) => { method = 'insert'; payload = value; return q; },
    update: (value: unknown) => { method = 'update'; payload = value; return q; },
    upsert: (value: unknown) => { method = 'upsert'; payload = value; return q; },
    delete: () => { method = 'delete'; return q; },
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(() => method === 'read' ? mocks.read(table) : mocks.write(table, method, payload)).then(resolve, reject),
  }; return q;
} } }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.refresh.mockResolvedValue(undefined);
  mocks.read.mockImplementation((table: string) => ({ data: table === 'roles_catalog' ? [{ id: 'role', name: 'Cashier', color: null }] : [], error: null }));
  mocks.write.mockResolvedValue({ data: [{ id: 'saved', business_id: 'shop' }], error: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function roleEditor() { render(<RolesSettings />); fireEvent.click(await screen.findByRole('button', { name: 'Edit' })); return screen.getByRole('textbox', { name: 'Role name' }); }
it.each(['reported', 'rejected'])('role assignment %s load errors fail closed and retry', async kind => {
  mocks.read.mockImplementation((table: string) => {
    if (table === 'employee_profiles') {
      if (kind === 'rejected') throw new Error('Offline');
      return { data: null, error: { message: 'Denied' } };
    }
    return { data: [{ id: 'role', name: 'Cashier', color: null }], error: null };
  });
  render(<RolesSettings />); await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Delete role Cashier' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add role' })).toBeDisabled();
  mocks.read.mockImplementation((table: string) => ({ data: table === 'employee_profiles' ? [{ primary_role_id: 'role' }] : [{ id: 'role', name: 'Cashier', color: null }], error: null }));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Delete role Cashier' })).toBeDisabled();
});
it.each(['reported', 'rejected', 'empty'])('role edits retain the draft after %s failure and permit retry', async kind => {
  if (kind === 'rejected') mocks.write.mockRejectedValueOnce(new Error('Offline'));
  else mocks.write.mockResolvedValueOnce({ data: [], error: kind === 'reported' ? { message: 'Denied' } : null });
  const input = await roleEditor(); fireEvent.change(input, { target: { value: 'Supervisor' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled()); expect(input).toHaveValue('Supervisor');
  expect(mocks.success).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Role updated'));
});
it('role creation releases busy state after a rejected request', async () => {
  render(<RolesSettings />); await screen.findByRole('button', { name: 'Edit' });
  fireEvent.change(screen.getByLabelText('New role name'), { target: { value: 'Supervisor' } });
  mocks.write.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Offline'));
  expect(screen.getByRole('button', { name: 'Add role' })).toBeEnabled();
  expect(screen.getByLabelText('New role name')).toHaveValue('Supervisor');
});
it('role deletion reports a database reference conflict without claiming success', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true); mocks.write.mockResolvedValue({ data: null, error: { code: '23503' } });
  render(<RolesSettings />); fireEvent.click(await screen.findByRole('button', { name: 'Delete role Cashier' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/still used/)));
  expect(mocks.success).not.toHaveBeenCalled(); expect(screen.getByText('Cashier')).toBeInTheDocument();
});
it('role deletion does not claim success for zero affected rows', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true); mocks.write.mockResolvedValue({ data: [], error: null });
  render(<RolesSettings />); fireEvent.click(await screen.findByRole('button', { name: 'Delete role Cashier' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled()); expect(mocks.success).not.toHaveBeenCalled();
});
it('blocks duplicate role submissions while a write is pending', async () => {
  let finish!: (value: unknown) => void; mocks.write.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const input = await roleEditor(); fireEvent.change(input, { target: { value: 'Supervisor' } });
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
  await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
  await act(async () => finish({ data: [{ id: 'role' }], error: null }));
  expect(mocks.success).toHaveBeenCalledTimes(1);
});
it.each(['rejected', 'empty'])('theme save handles %s failure without staying busy', async kind => {
  if (kind === 'rejected') mocks.write.mockRejectedValueOnce(new Error('Offline'));
  else mocks.write.mockResolvedValueOnce({ data: [], error: null });
  render(<BrandingSettings />); fireEvent.click(screen.getByRole('button', { name: /Forest/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save theme' })).toBeEnabled());
  expect(mocks.success).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Theme saved'));
});
it.each(['rejected', 'empty'])('store save retains the dialog on %s failure', async kind => {
  if (kind === 'rejected') mocks.write.mockRejectedValueOnce(new Error('Offline'));
  else mocks.write.mockResolvedValueOnce({ data: [], error: null });
  render(<Stores />); fireEvent.click(screen.getByRole('button', { name: 'Add store' }));
  const dialog = screen.getByRole('dialog', { name: 'Add store' });
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'New location' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByText(kind === 'rejected' ? 'Offline' : /Store was not saved/);
  expect(within(dialog).getByLabelText('Name')).toHaveValue('New location');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('blocks duplicate store submissions', async () => {
  let finish!: (value: unknown) => void; mocks.write.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<Stores />); fireEvent.click(screen.getByRole('button', { name: 'Add store' }));
  const dialog = screen.getByRole('dialog', { name: 'Add store' });
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'New location' } });
  act(() => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); });
  await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
  await act(async () => finish({ data: [{ id: 'store' }], error: null }));
});
it.each(['rejected', 'empty'])('holiday toggle rolls back on %s failure and permits retry', async kind => {
  if (kind === 'rejected') mocks.write.mockRejectedValueOnce(new Error('Offline'));
  else mocks.write.mockResolvedValueOnce({ data: [], error: null });
  render(<HolidaySettings />); const checkbox = screen.getByRole('checkbox', { name: 'Enable public holidays' });
  fireEvent.click(checkbox); await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(checkbox).toBeChecked(); expect(checkbox).toBeEnabled(); expect(mocks.success).not.toHaveBeenCalled();
  fireEvent.click(checkbox); await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Public holiday settings saved'));
});
it('company holiday deletion releases its controls after a rejected request', async () => {
  mocks.read.mockImplementation((table: string) => ({ data: table === 'custom_holidays' ? [{ id: 'closure', date: '2027-01-01', name: 'Closure', blocks_scheduling: true }] : [], error: null }));
  mocks.write.mockRejectedValueOnce(new Error('Offline')); render(<HolidaySettings />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Closure' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Offline'));
  expect(screen.getByRole('button', { name: 'Remove Closure' })).toBeEnabled(); expect(mocks.success).not.toHaveBeenCalled();
});

it('blocks duplicate theme saves and locks the selected preset during the write', async () => {
  let finish!: (value: unknown) => void;
  mocks.write.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<BrandingSettings />); fireEvent.click(screen.getByRole('button', { name: /Forest/ }));
  const save = screen.getByRole('button', { name: 'Save theme' });
  act(() => { fireEvent.click(save); fireEvent.click(save); });
  await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: /Forest/ })).toBeDisabled();
  await act(async () => finish({ data: [{ business_id: 'shop' }], error: null }));
  expect(mocks.success).toHaveBeenCalledTimes(1);
});
it('company holiday deletion does not report success for zero affected rows', async () => {
  mocks.read.mockImplementation((table: string) => ({ data: table === 'custom_holidays' ? [{ id: 'closure', date: '2027-01-01', name: 'Closure', blocks_scheduling: true }] : [], error: null }));
  mocks.write.mockResolvedValueOnce({ data: [], error: null }); render(<HolidaySettings />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Closure' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/not removed/)));
  expect(mocks.success).not.toHaveBeenCalled(); expect(screen.getByText('Closure')).toBeInTheDocument();
});
