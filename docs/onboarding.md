# Workspace onboarding

The dashboard shows a short first-visit welcome and a role-specific checklist. On phones, management checklists show only the next incomplete task until expanded. Employee guidance always exposes all three destinations. The dashboard and navigation remain usable when guidance loading fails.

Owner/Admin progress reflects active stores, a successful leave-year save, staff invitations or an existing team, and published shifts. Default calendar-year settings do not count as reviewed until saved. Configured historical policies are recognised at migration time. Policy markers commit and roll back with the business update. Entitlements stay in the existing Team controls; onboarding does not add a global entitlement setting.

Managers explore Team, publish a rota and explore leave review. Employees explore Profile, Rota and Leave & absence. Exploration only records a page visit; it creates no leave, shift, profile or employment changes. Shift changes are signposted in the descriptions.

Welcome, hidden state and explored destinations persist per user, business and role. A hidden checklist can be restored from the dashboard. Role changes receive independent guidance, and progress is fetched afresh when the dashboard opens. No personal details or health information are stored in onboarding records. Direct table access is revoked; scoped RPCs require active membership and derive the caller’s role themselves.

Checks cover scoped preferences, inactive/anonymous access, forged steps, transactional policy saves, role changes, failures/retries, late responses, desktop/mobile layout, focus containment and Settings deep links.
