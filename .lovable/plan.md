

The Rota typecheck is already fixed (status cast to literal union). What remains: wire all routes in `App.tsx` + replace the placeholder `Index.tsx` redirect, then verify demo logins.

## Plan

**1. Update `src/App.tsx`** — register all routes:
- Public: `/` → Landing, `/features`, `/pricing`
- Auth: `/login`, `/signup`, `/forgot-password`, `/reset-password`
- Protected (wrapped in `AuthProvider` + `ProtectedRoute` + `AppShell`):
  - `/dashboard`, `/rota`, `/leave`, `/profile`
  - Manager-only (`roles={['owner','manager']}`): `/team`, `/stores`, `/settings`
- Wrap `<Routes>` in `<AuthProvider>` inside `<BrowserRouter>`
- Keep `NotFound` catch-all

**2. Remove placeholder `src/pages/Index.tsx`** usage — Landing becomes `/`.

**3. Verify end-to-end** via the preview:
- Load `/`, navigate to `/login`
- Sign in as `owner@lavoro.demo` / `LavoroDemo123!` → confirm dashboard, rota grid renders with seeded shifts, manager-only nav visible
- Sign in as `employee@lavoro.demo` → confirm restricted nav (no Team/Stores/Settings), personal shifts visible
- Check console for errors; query DB if shifts/leave don't render

No DB or component changes needed beyond routing.

