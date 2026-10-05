import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CoverageRecoveryCard } from './CoverageRecoveryCard';
const api = vi.hoisted(() => ({ notify: vi.fn(), toast: vi.fn(), fetch: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: api.toast, error: vi.fn() } }));
vi.mock('./coverage', () => ({
  fetchAffectedShifts: api.fetch, notifyAvailableStaff: api.notify,
  suggestReplacements: vi.fn().mockResolvedValue([]), assignReplacement: vi.fn(), openShiftsForPickup: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  api.fetch.mockResolvedValue([{ id: 'shift', shift_date: '2026-11-02', start_time: '09:00', end_time: '17:00', break_minutes: 0 }]);
});
afterEach(cleanup);
const show = async () => {
  render(<CoverageRecoveryCard businessId="shop" userId="absent" startDate="2026-11-02" endDate="2026-11-02" />);
  return screen.findByRole('button', { name: 'Notify available staff' });
};
it('keeps delivery failure visible and retries without claiming it succeeded', async () => {
  api.notify.mockRejectedValueOnce(new Error('Network failed'));
  api.notify.mockResolvedValueOnce({ sent: 0, alreadySent: 2 });
  fireEvent.click(await show());
  await screen.findByRole('alert');
  expect(api.toast).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(api.toast).toHaveBeenCalledWith('Staff have already been notified in the app'));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(api.notify.mock.calls[0]).toEqual(api.notify.mock.calls[1]);
});
it('blocks concurrent notification requests while the first is pending', async () => {
  let finish!: (value: { sent: number; alreadySent: number }) => void;
  api.notify.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const button = await show();
  fireEvent.click(button); fireEvent.click(button);
  expect(api.notify).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  finish({ sent: 1, alreadySent: 0 });
  await waitFor(() => expect(api.toast).toHaveBeenCalledWith('1 staff notified in the app'));
});
it('does not claim employees were notified when none were available', async () => {
  api.notify.mockResolvedValue({ sent: 0, alreadySent: 0 });
  fireEvent.click(await show());
  await waitFor(() => expect(api.toast).toHaveBeenCalledWith('No available staff to notify'));
});
