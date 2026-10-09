# Shift change requests

Employees choose one of their own upcoming published shifts on Shift changes, or open it from the rota, and explain what change they need. Their explanation is visible only to themselves and management. Other employees’ rota access stays unchanged.

Managers, Owners and Admins propose a colleague to cover the shift, optionally exchanging one of that colleague’s upcoming published shifts. Both affected employees accept. Management then confirms. Until confirmation, assignments stay unchanged. Replacing a proposal clears both acceptances.

The server requires active membership, scopes all records to the business, rejects duplicate active requests for the same shift, checks shift versions and store/job-role eligibility, and rechecks leave, availability, overlaps and active stores through the existing assignment validator. Final confirmation updates both assignments in one transaction; failures roll back assignments, request status and notifications. Acceptances include the version of the proposal the employee actually reviewed.

Proposals expire when either affected shift begins, using the store timezone. Cancelling or declining does not change the rota. Deleted shifts retain the request snapshot but cannot be confirmed. Change history records request transitions and the final shift changes without recording explanations or manager notes.

In-app notifications are inserted transactionally for affected employees and active management, with a link to Shift changes. The page reconciles every 30 seconds while visible. This feature does not send email notifications.

Management sees warnings when the resulting published weekly hours exceed contracted hours or a proposed assignment leaves under 11 hours’ rest (including an overlap). These are review prompts, not an employment-law eligibility decision. Leave and overlap rules remain blocking.

Regression checks: scripts/test-shift-change-requests.mjs (isolated PostgreSQL), ShiftChanges.test.tsx and e2e/shift-changes.spec.ts.
