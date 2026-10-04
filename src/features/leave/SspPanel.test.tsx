import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SspPanel } from './SspPanel';
it('shows payroll guidance without obsolete estimates or a payroll export', () => {
  render(<SspPanel startDate="2026-10-01" endDate="2026-10-10" history={[]} />);
  expect(screen.getByText(/Lavoro does not calculate SSP/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /HMRC/ })).toHaveAttribute('href', 'https://www.gov.uk/guidance/statutory-sick-pay-manually-calculate-your-employees-payments');
  expect(screen.queryByText(/£|Waiting days|Eligible from|Estimated SSP/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Export payroll/ })).not.toBeInTheDocument();
});
