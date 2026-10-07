import { lazy } from "react";
import { PageBoundary } from "@/components/common/PageBoundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { BrandingProvider } from "@/features/branding/BrandingProvider";
import { PageMetadata } from "@/features/branding/PageMetadata";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
const AppShell = lazy(() => import("@/app/(app)/AppShell"));
import Signup from "@/app/(auth)/Signup";
import ForgotPassword from "@/app/(auth)/ForgotPassword";
import ResetPassword from "@/app/(auth)/ResetPassword";
import AcceptInvite from "@/app/(auth)/AcceptInvite";
import Login from "@/app/(auth)/Login";
const Features = lazy(() => import("@/app/(marketing)/Features"));
const Pricing = lazy(() => import("@/app/(marketing)/Pricing"));
const Dashboard = lazy(() => import("@/app/(app)/Dashboard"));
const Rota = lazy(() => import("@/app/(app)/Rota"));
const Leave = lazy(() => import("@/app/(app)/Leave"));
const StaffHistory = lazy(() => import("@/app/(app)/StaffHistory"));
const Team = lazy(() => import("@/app/(app)/Team"));
const Stores = lazy(() => import("@/app/(app)/Stores"));
const Profile = lazy(() => import("@/app/(app)/Profile"));
const Settings = lazy(() => import("@/app/(app)/Settings"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Analytics beforeSend={(event) => {
          const url = new URL(event.url);
          url.search = '';
          url.hash = '';
          return { ...event, url: url.toString() };
        }} />
        <AuthProvider>
          <BrandingProvider>
          <PageMetadata />
          <PageBoundary fullPage>
          <Routes>
            {/* Home resolves through the same account checks as protected pages. */}
            <Route path="/" element={<ProtectedRoute><Navigate to="/dashboard" replace /></ProtectedRoute>} />
            <Route path="/features" element={<Features />} />
            <Route path="/pricing" element={<Pricing />} />

            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />

            {/* The shell stays mounted while only protected page content loads. */}
            <Route element={<AppShell><ProtectedRoute><Outlet /></ProtectedRoute></AppShell>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/rota" element={<Rota />} />
              <Route path="/leave" element={<Leave />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/team" element={<ProtectedRoute permission="manage_staff"><Team /></ProtectedRoute>} />
              <Route path="/team/:userId" element={<ProtectedRoute roles={['owner']} fallback="denied"><StaffHistory /></ProtectedRoute>} />
              <Route path="/stores" element={<ProtectedRoute permission="manage_stores" fallback="denied"><Stores /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute permission="manage_settings" fallback="denied"><Settings /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </PageBoundary>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
  </QueryClientProvider>
);

export default App;
