export interface PayrollRow {
  user_id: string;
  full_name: string;
  email: string;
  shift_count: number;
  scheduled_minutes: number;
  annual_leave_days: number;
  sickness_days: number;
}

// Quote every value and neutralise spreadsheet formulas in user-entered text.
function cell(value: string | number) {
  const text = String(value);
  const safe = typeof value === 'string' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function payrollCsv(rows: readonly PayrollRow[], start: string, end: string): string {
  const headers = ['Period start', 'Period end', 'Employee ID', 'Employee name', 'Email', 'Published shifts', 'Scheduled hours after breaks', 'Approved annual leave (working days)', 'Approved sickness (calendar days)'];
  const lines = rows.map(row => [start, end, row.user_id, row.full_name, row.email, row.shift_count, (row.scheduled_minutes / 60).toFixed(2), row.annual_leave_days, row.sickness_days].map(cell).join(','));
  return '\uFEFF' + [headers.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
}
export function downloadPayroll(csv: string, start: string, end: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `lavoro-payroll-${start}-to-${end}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  // Keep the object URL alive until the browser starts reading the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
