
Add a "Copy previous week" button next to "Publish drafts" in Rota header. Manager-only. On click:
1. Fetch shifts from previous week (weekStart - 7 days, range of 7 days), scoped to current store filter and business.
2. For each, insert a new shift with `shift_date` shifted +7 days, `is_published: false`, `status` derived from assignment, copy all other fields (start/end, store, role, assigned_user_id, break, notes), `created_by: user.id`, omit id/timestamps/schedule_id.
3. Confirm if current week already has shifts (avoid accidental duplicates).
4. Reload after insert.
