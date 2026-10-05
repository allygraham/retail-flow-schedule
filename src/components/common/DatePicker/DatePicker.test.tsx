import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DatePicker, type DateRangeValue } from './DatePicker';
import { toISODate } from './dateValues';
function Form({ initial = { from: new Date(2026, 9, 4), to: new Date(2026, 9, 4) } }: { initial?: DateRangeValue }) {
  const [value, setValue] = useState(initial);
  return <><DatePicker mode="range" value={value} onChange={setValue} placeholder="Dates" />
    <button>Submit</button><output aria-label="Saved dates">{toISODate(value.from)} / {toISODate(value.to)}</output></>;
}
afterEach(() => { cleanup(); vi.useRealTimers(); });
function november() {
  fireEvent.click(screen.getByRole('button', { name: 'Dates' }));
  fireEvent.click(screen.getByRole('button', { name: /next month/i }));
}
it('one click on 28 November replaces 4 October even when closed outside', () => {
  render(<Form />); november();
  fireEvent.click(screen.getByRole('button', { name: /Saturday, November 28th, 2026/i }));
  expect(screen.getByLabelText('Saved dates')).toHaveTextContent('2026-11-28 / 2026-11-28');
  act(() => screen.getByRole('button', { name: 'Submit' }).focus());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Saved dates')).toHaveTextContent('2026-11-28 / 2026-11-28');
});
it('extends the first day to a range and allows selecting the same day twice', () => {
  render(<Form />); november();
  fireEvent.click(screen.getByRole('button', { name: /Saturday, November 28th, 2026/i }));
  fireEvent.click(screen.getByRole('button', { name: /Sunday, November 29th, 2026/i }));
  expect(screen.getByLabelText('Saved dates')).toHaveTextContent('2026-11-28 / 2026-11-29');
  fireEvent.click(screen.getByRole('button', { name: 'Dates' }));
  fireEvent.click(screen.getByRole('button', { name: /Saturday, November 28th, 2026/i }));
  fireEvent.click(screen.getByRole('button', { name: /Saturday, November 28th, 2026/i }));
  expect(screen.getByLabelText('Saved dates')).toHaveTextContent('2026-11-28 / 2026-11-28');
});
it('clear removes both saved dates instead of retaining a previous value', () => {
  render(<Form />);
  fireEvent.click(screen.getByRole('button', { name: 'Clear date' }));
  expect(screen.getByLabelText('Saved dates')).toHaveTextContent('/');
  expect(screen.getByLabelText('Saved dates')).not.toHaveTextContent('2026');
});
