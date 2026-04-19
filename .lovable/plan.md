
This is a question, not an implementation request — answer directly from the code, no plan needed.

From `src/app/(app)/Rota.tsx`:
- Managers/owners (`role === 'owner' || 'manager'`) get edit affordances; employees see read-only.
- Grid: rows = employees (+ Unassigned row), columns = 7 days of the selected week.
- Create: click an empty cell → `openCreate(date)` opens Modal with defaults (09:00–17:00, 30min break, current store filter).
- Edit: click an existing shift → `openEdit(sh)` opens same modal pre-filled.
- Modal fields: date, start/end, store, role, assign-to (employee or unassigned), break, published (draft/published), notes. Validated by `shiftSchema` (Zod).
- Save: insert/update `shifts` row with `business_id`, `created_by`, `status` derived from assignment.
- Reassign/move: drag a shift card to another (employee, day) cell — empty target = move, occupied = swap. Optimistic update + Supabase update.
- Publish: "Publish drafts" button bulk-flips `is_published=true` for all draft shifts in the current view.
- Week nav: Prev / This week / Next; Store filter scopes the grid.
- Conflicts: inline badges for overlap with another shift same day, or approved/pending leave.
