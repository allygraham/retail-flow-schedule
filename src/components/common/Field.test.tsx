import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Field, Input, Select, TextArea } from './Field';
import { DatePicker } from './DatePicker';
afterEach(cleanup);
it.each([Input, Select, TextArea])('connects a shared control to its label and hint', Control => {
  render(<Field label="Employee details" hint="Required information"><Control /></Field>);
  const control = screen.getByLabelText('Employee details');
  expect(control).toHaveAccessibleName('Employee details');
  expect(control).toHaveAccessibleDescription('Required information');
  expect(document.querySelector('label')).toHaveAttribute('for', control.id);
});
it('preserves explicit IDs and existing descriptions', () => {
  render(<><span id="extra">Extra help</span><Field label="Hours" hint="Weekly hours"><Input id="hours" aria-describedby="extra" /></Field></>);
  expect(screen.getByLabelText('Hours')).toHaveAttribute('id', 'hours');
  expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('Extra help Weekly hours');
});
it('exposes validation errors and removes invalid state after recovery', () => {
  const { rerender } = render(<Field label="Name" hint="Your name" error="Name required"><Input /></Field>);
  expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Name required');
  expect(screen.getByRole('alert')).toHaveTextContent('Name required');
  rerender(<Field label="Name" hint="Your name"><Input /></Field>);
  expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');
  expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Your name');
});
it('keeps explicit accessible names on grouped controls and gives them unique IDs', () => {
  render(<Field label="Date range"><div><Input aria-label="From" /><Input aria-label="To" /></div></Field>);
  expect(screen.getByRole('group', { name: 'Date range' })).toBeInTheDocument();
  expect(screen.getByLabelText('From').id).not.toBe(screen.getByLabelText('To').id);
});
it('uses a field label and hint for a date picker while preserving its explicit name', () => {
  const { rerender } = render(<Field label="Start date" hint="First shift"><DatePicker value={null} onChange={() => {}} /></Field>);
  expect(screen.getByRole('button', { name: 'Start date' })).toHaveAccessibleDescription('First shift');
  rerender(<Field label="Start date"><DatePicker value={null} onChange={() => {}} ariaLabel="Pick start date" /></Field>);
  expect(screen.getByRole('button', { name: 'Pick start date' })).toBeInTheDocument();
});
it('does not leave controls outside a Field with stale field attributes', () => {
  render(<Input aria-label="Standalone" />);
  expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-labelledby');
  expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
});
