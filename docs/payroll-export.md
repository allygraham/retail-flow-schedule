# Payroll CSV export

Owners and Admins can open Payroll, choose an inclusive period of up to 366 days, preview totals and download CSV. The previous calendar month is selected initially. A fresh server snapshot is read for each download. Managers, employees, deactivated accounts and other businesses cannot call the export API.

Each row contains the period, stable employee ID, name, email, published shift count, scheduled hours after unpaid breaks, approved annual leave working days and approved sickness calendar days. Hours are attributed to the shift date. Totals are summed in minutes and rounded to two decimal places only when displayed/exported. Draft, cancelled and unassigned shifts are excluded. Pending/rejected/cancelled absence is excluded. Overlapping absence dates are counted once per absence type; annual leave uses the working pattern saved at approval. An unknown saved annual leave pattern blocks export rather than guessing deductions.

Former employees remain included when they have qualifying records. Admins have no staffing allocation, but employment records from dates before Admin assignment are retained in historical exports. No medical reasons, sickness categories or internal notes are included. User-entered CSV values are quoted, escaped and protected against spreadsheet formula interpretation. The file uses UTF-8 with a BOM for Excel.

This is a payroll-input report, not calculated payroll: there are no actual attendance hours, historical pay rates, overtime rules, holiday/sick pay amounts, SSP amounts, taxes or deductions. Review scheduled hours against actual attendance before using them for payroll. The CSV is a generic format, without a payroll-provider-specific mapping.

The data is generated on demand and no CSV files are stored in the database. Apply `20261009130000_payroll_export.sql` before publishing the frontend. Tests cover totals, period boundaries, saved working patterns, staff history, cross-business access, CSV handling and browser downloads.
