import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { LeaveBalanceCard } from './LeaveBalanceCard';
it('shows excess leave explicitly instead of clamping it to zero', () => {
  render(<LeaveBalanceCard balance={{ year: 2026, entitlement: 20, taken: 23, pending: 0, remaining: -3 }} />);
  expect(screen.getByText('Over entitlement')).toBeInTheDocument(); expect(screen.getByText('3 days')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '23 days taken of 20 days entitlement');
});
