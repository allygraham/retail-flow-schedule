# Admin access and change history

Admin is a business-scoped operational role. Owners alone assign or invite Admins. Admins manage schedules, staff, stores, leave and settings, but cannot grant privileged access or change Owner/Admin membership. Admins are excluded from rota people, leave recipients, staffing counts and personal entitlement. Upcoming shifts and pending/approved leave must be removed before converting a staffing account to Admin. Historical employment/leave data is preserved.

Change history is visible to active Owners/Admins only. Database triggers write selected changed fields in the same transaction as the original mutation; failed mutations leave no history. Application users cannot insert, update or delete history. Medical details, internal notes, invitation codes and passwords are excluded. History starts at migration deployment; previous activity is not backfilled.

Events have stable UUIDs, business IDs, timestamps, actor snapshots, selected before/after values and a schema version. A business/time index supports browsing. No automatic archive or purge is enabled. Future archiving can export bounded batches ordered by timestamp/ID into private object storage, verify counts/checksums, and remove database rows only after verification. Retention and archive access should be agreed before enabling that process. Changes to archive access must preserve tenant and Owner/Admin restrictions.

Deployment: apply both new migrations in order, then deploy the updated `invite-employee` function and frontend. PostgreSQL must commit the enum migration before the following migration uses Admin. The new isolated test suite is included automatically in `npm run test:db`; browser coverage is in `e2e/admin-history.spec.ts`.
