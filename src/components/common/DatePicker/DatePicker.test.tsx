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

it('disabled date fields cannot open a calendar or clear their value', () => {
  const change = vi.fn();
  render(<DatePicker disabled value={new Date(2026, 10, 28)} onChange={change} placeholder="Start date" />);
  const trigger = screen.getByRole('button', { name: 'Start date' });
  expect(trigger).toBeDisabled();
  fireEvent.click(trigger);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Clear date' })).toBeNull();
  expect(change).not.toHaveBeenCalled();
});
it('prevents selection outside date bounds and on unavailable dates', () => {
  const change = vi.fn();
  render(<DatePicker value={new Date(2026, 10, 28)} onChange={change}
    minDate={new Date(2026, 10, 27)} maxDate={new Date(2026, 10, 30)}
    disabledDates={new Date(2026, 10, 29)} placeholder="Start date" />);
  fireEvent.click(screen.getByRole('button', { name: 'Start date' }));
  for (const day of [/November 26th, 2026/i, /November 29th, 2026/i, /December 1st, 2026/i]) {
    const button = screen.getByRole('button', { name: day });
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /November 30th, 2026/i }));
  expect(change).toHaveBeenCalledWith(new Date(2026, 10, 30));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('starting a range earlier than its first day replaces the start before extending', () => {
  render(<Form />); november();
  fireEvent.click(screen.getByRole('button', { name: /November 28th, 2026/i }));
  fireEvent.click(screen.getByRole('button', { name: /November 27th, 2026/i }));
  expect(screen.getByLabelText('Saved dates')).toHaveTextContent('2026-11-27 / 2026-11-27');
  expect(screen.getByRole('dialog', { name: 'Choose date' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /November 30th, 2026/i }));
  expect(screen.getByLabelText('Saved dates')).toHaveTextContent('2026-11-27 / 2026-11-30');
  expect(screen.queryByRole('dialog')).toBeNull();
});
