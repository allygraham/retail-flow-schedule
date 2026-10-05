import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StoreSelect, type StoreOption } from './StoreSelect';
afterEach(cleanup);
const store = { id: 'one', name: 'Main store' };
function Picker({ options }: { options: StoreOption[] }) {
  const [value, setValue] = useState('all');
  return <StoreSelect options={options} value={value} onChange={setValue} />;
}
it('selects the sole store once options finish loading', () => {
  const view = render(<Picker options={[]} />);
  expect(screen.getByRole('button', { name: 'All stores' })).toBeInTheDocument();
  view.rerender(<Picker options={[store]} />);
  expect(screen.getByRole('button', { name: 'Main store' })).toBeInTheDocument();
});
it('keeps All stores available after automatic selection', () => {
  const view = render(<Picker options={[store]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Main store' }));
  fireEvent.click(screen.getByRole('option', { name: 'All stores' }));
  view.rerender(<Picker options={[{ ...store }]} />);
  expect(screen.getByRole('button', { name: 'All stores' })).toBeInTheDocument();
});
it('does not pick arbitrarily when multiple stores are available', () => {
  render(<Picker options={[store, { id: 'two', name: 'Other store' }]} />);
  expect(screen.getByRole('button', { name: 'All stores' })).toBeInTheDocument();
});
it('does not overwrite an existing store selection', () => {
  const change = vi.fn();
  render(<StoreSelect options={[store]} value="one" onChange={change} />);
  expect(change).not.toHaveBeenCalled();
});
