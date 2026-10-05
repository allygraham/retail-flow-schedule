import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SspPanel } from './SspPanel';
afterEach(cleanup);
const show = () => render(<SspPanel startDate="2026-10-05" endDate="2026-10-11" history={[]} workingDays={[1,3,5]} />);
const fill = () => {
  fireEvent.change(screen.getByLabelText('Average weekly earnings (£)'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Qualifying days of SSP already paid in this linked series'), { target: { value: '0' } });
  fireEvent.click(screen.getByLabelText(/I have checked SSP eligibility/));
  fireEvent.click(screen.getByRole('button', { name: 'Calculate SSP estimate' }));
};
it('requires explicit earnings and previous paid days instead of inventing values', () => {
  show(); fireEvent.click(screen.getByRole('button', { name: /Calculate/ })); expect(screen.getByRole('alert')).toHaveTextContent('Enter average weekly earnings');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('calculates using employee weekdays and entered earnings', () => {
  show(); fill(); expect(screen.getByRole('status')).toHaveTextContent('£80.00'); expect(screen.getByRole('status')).toHaveTextContent('3');
  expect(screen.getByRole('link', { name: 'HMRC calculation guidance' })).toHaveAttribute('href', 'https://www.gov.uk/guidance/statutory-sick-pay-manually-calculate-your-employees-payments');
});
it('invalidates a displayed estimate when inputs change', () => {
  show(); fill(); fireEvent.change(screen.getByLabelText('Average weekly earnings (£)'), { target: { value: '200' } });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('does not assume weekdays when none are configured', () => {
  render(<SspPanel startDate="2026-10-05" endDate="2026-10-11" history={[]} />); fill();
  expect(screen.getByRole('alert')).toHaveTextContent('qualifying weekdays'); expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('uses earliest linked absence for the earnings date and rejects a later date', () => {
  render(<SspPanel startDate="2026-10-05" endDate="2026-10-11" history={[{ start_date: '2026-09-01', end_date: '2026-09-02', leave_type: 'sick', status: 'approved' }]} workingDays={[1,3,5]} />);
  expect(screen.getByLabelText('First full sick day in the linked series')).toHaveValue('2026-09-01');
  fireEvent.change(screen.getByLabelText('First full sick day in the linked series'), { target: { value: '2026-10-05' } }); fill();
  expect(screen.getByRole('alert')).toHaveTextContent('recorded sickness history');
});
it('blocks pre-April linked series instead of applying current rules', () => {
  render(<SspPanel startDate="2026-04-08" endDate="2026-04-10" history={[{ start_date: '2026-04-01', end_date: '2026-04-02', leave_type: 'sick', status: 'approved' }]} workingDays={[1,3,5]} />); fill();
  expect(screen.getByRole('alert')).toHaveTextContent('transition'); expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('requires eligibility confirmation before displaying a payment estimate', () => {
  show();
  fireEvent.change(screen.getByLabelText('Average weekly earnings (£)'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Qualifying days of SSP already paid in this linked series'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Calculate SSP estimate' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Confirm eligibility');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('shows exhaustion clearly when the entire linked entitlement is already used', () => {
  render(<SspPanel startDate="2026-11-02" endDate="2026-11-08" history={[]} workingDays={[1,3,5]} />);
  fireEvent.change(screen.getByLabelText('First full sick day in the linked series'), { target: { value: '2026-04-06' } });
  fireEvent.change(screen.getByLabelText('Average weekly earnings (£)'), { target: { value: '200' } });
  fireEvent.change(screen.getByLabelText('Qualifying days of SSP already paid in this linked series'), { target: { value: '84' } });
  fireEvent.click(screen.getByLabelText(/I have checked SSP eligibility/));
  fireEvent.click(screen.getByRole('button', { name: 'Calculate SSP estimate' }));
  expect(screen.getByRole('status')).toHaveTextContent('£0.00');
  expect(screen.getByRole('status')).toHaveTextContent('No payable days');
  expect(screen.getByRole('status')).toHaveTextContent('3 qualifying days excluded by the 28-week limit');
});
it('changing qualifying weekdays removes the estimate until recalculated', () => {
  show(); fill();
  fireEvent.click(screen.getByLabelText('Monday', { exact: true }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Calculate SSP estimate' }));
  expect(screen.getByRole('status')).toHaveTextContent('£80.00');
  expect(screen.getByRole('status')).toHaveTextContent('2026-10-07');
});
it('overlapping sickness history blocks calculation instead of double counting', () => {
  render(<SspPanel startDate="2026-10-05" endDate="2026-10-11" history={[{ id: 'other', start_date: '2026-10-08', end_date: '2026-10-12', leave_type: 'sick', status: 'approved' }]} workingDays={[1,3,5]} />);
  fill(); expect(screen.getByRole('alert')).toHaveTextContent('overlaps');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('labels the reviewed policy and includes its year beside the weekly rate', () => {
  show();
  expect(screen.getByText('SSP estimate · 2026/27')).toBeInTheDocument();
  fill();
  expect(screen.getByRole('status')).toHaveTextContent('2026/27: £80.00');
});
it('labels unsupported future dates and explains the missing policy', () => {
  render(<SspPanel startDate="2027-04-06" endDate="2027-04-07" history={[]} workingDays={[1,3,5]} />);
  expect(screen.getByText('SSP estimate · Unsupported dates')).toBeInTheDocument();
  fill();
  expect(screen.getByRole('alert')).toHaveTextContent('No reviewed SSP policy for 2027-04-06');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
