import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useState } from 'react';
import { Modal } from './Modal';

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
