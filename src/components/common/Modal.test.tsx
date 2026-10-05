import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useState } from 'react';
import { Modal } from './Modal';
import { DatePicker } from './DatePicker/DatePicker';
import { toISODate } from './DatePicker/dateValues';

afterEach(cleanup);
function FormDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  return <div>
    <button onClick={() => setOpen(true)}>Open form</button>
    <label>Background search<input /></label>
    <Modal open={open} onClose={() => setOpen(false)} title="Employee details"
      footer={<button onClick={() => setOpen(false)}>Save</button>}>
      <label>Name<input value={name} onChange={e => setName(e.target.value)} /></label>
    </Modal>
  </div>;
}
const show = async () => {
  render(<FormDialog />);
  const opener = screen.getByRole('button', { name: 'Open form' });
  opener.focus(); fireEvent.click(opener);
  const dialog = await screen.findByRole('dialog', { name: 'Employee details' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());
  return { opener, dialog };
};
it('provides a modal accessible title and hides background content', async () => {
  const { dialog } = await show();
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByRole('heading', { name: 'Employee details' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Open form' })).toBeNull();
});
it('closes on Escape and restores focus to its opener', async () => {
  const { opener } = await show();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(opener).toHaveFocus());
});
it('keeps focus in the form during input rerenders and wraps Tab both ways', async () => {
  await show();
  const field = screen.getByRole('textbox', { name: 'Name' });
  field.focus(); fireEvent.change(field, { target: { value: 'New name' } });
  expect(field).toHaveFocus();
  const save = screen.getByRole('button', { name: 'Save' });
  save.focus(); fireEvent.keyDown(save, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(save).toHaveFocus();
});
it('close button removes background isolation and restores the opener', async () => {
  const { opener } = await show();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(opener).toHaveFocus());
  expect(screen.getByRole('textbox', { name: 'Background search' })).toBeVisible();
});

function CalendarForm() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | null>(new Date(2026, 10, 28));
  return <>
    <button onClick={() => setOpen(true)}>Request leave</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Leave request">
      <DatePicker value={date} onChange={setDate} placeholder="Leave date" />
      <label>Notes<textarea /></label>
      <output aria-label="Selected leave date">{toISODate(date)}</output>
    </Modal>
  </>;
}
async function openCalendarForm() {
  render(<CalendarForm />);
  const opener = screen.getByRole('button', { name: 'Request leave' });
  act(() => opener.focus());
  fireEvent.click(opener);
  const parent = await screen.findByRole('dialog', { name: 'Leave request' });
  const trigger = within(parent).getByRole('button', { name: 'Leave date' });
  act(() => trigger.focus());
  fireEvent.click(trigger);
  await screen.findByRole('dialog', { name: 'Choose date' });
  return { opener, parent, trigger };
}
it('Escape dismisses a nested calendar before closing its form', async () => {
  const { opener, parent, trigger } = await openCalendarForm();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose date' })).toBeNull());
  expect(parent).toBeVisible();
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.keyDown(trigger, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(opener).toHaveFocus());
});
it('selecting a calendar date updates the form and restores focus without dismissing it', async () => {
  const { parent, trigger } = await openCalendarForm();
  fireEvent.click(screen.getByRole('button', { name: /Sunday, November 29th, 2026/i }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose date' })).toBeNull());
  expect(parent).toBeVisible();
  expect(within(parent).getByLabelText('Selected leave date')).toHaveTextContent('2026-11-29');
  await waitFor(() => expect(trigger).toHaveFocus());
});
it('moving to the next form field dismisses the calendar and keeps that field focused', async () => {
  const { parent } = await openCalendarForm();
  const notes = within(parent).getByRole('textbox', { name: 'Notes' });
  act(() => notes.focus());
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose date' })).toBeNull());
  await waitFor(() => expect(notes).toHaveFocus());
  expect(parent).toBeVisible();
});
it('a closed controlled dialog exposes no form fields', () => {
  render(<Modal open={false} onClose={() => {}} title="Hidden form"><label>Secret<input /></label></Modal>);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('textbox', { name: 'Secret' })).toBeNull();
});
it('saving through the footer closes the form and returns focus', async () => {
  const { opener } = await show();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(opener).toHaveFocus());
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('unmounting an open form releases background isolation and scroll locking', async () => {
  const view = render(<><button>Background action</button><Modal open onClose={() => {}} title="Temporary form"><input aria-label="Name" /></Modal></>);
  await screen.findByRole('dialog', { name: 'Temporary form' });
  expect(document.body).toHaveAttribute('data-scroll-locked');
  view.rerender(<button>Background action</button>);
  await waitFor(() => expect(document.body).not.toHaveAttribute('data-scroll-locked'));
  expect(screen.getByRole('button', { name: 'Background action' })).toBeVisible();
});
