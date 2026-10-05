import { lazy } from "react";
import { PageBoundary } from "@/components/common/PageBoundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { BrandingProvider } from "@/features/branding/BrandingProvider";
import { PageMetadata } from "@/features/branding/PageMetadata";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import AppShell from "@/app/(app)/AppShell";
import Login from "@/app/(auth)/Login";
const Landing = lazy(() => import("@/app/(marketing)/Landing"));
const Features = lazy(() => import("@/app/(marketing)/Features"));
const Pricing = lazy(() => import("@/app/(marketing)/Pricing"));
const Signup = lazy(() => import("@/app/(auth)/Signup"));
const ForgotPassword = lazy(() => import("@/app/(auth)/ForgotPassword"));
const ResetPassword = lazy(() => import("@/app/(auth)/ResetPassword"));
const AcceptInvite = lazy(() => import("@/app/(auth)/AcceptInvite"));
const Dashboard = lazy(() => import("@/app/(app)/Dashboard"));
const Rota = lazy(() => import("@/app/(app)/Rota"));
const Leave = lazy(() => import("@/app/(app)/Leave"));
const Team = lazy(() => import("@/app/(app)/Team"));
const Stores = lazy(() => import("@/app/(app)/Stores"));
const Profile = lazy(() => import("@/app/(app)/Profile"));
const Settings = lazy(() => import("@/app/(app)/Settings"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
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
          <PageBoundary>
          <Routes>
            {/* Public marketing */}
            <Route path="/" element={<Landing />} />
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
              <Route path="/stores" element={<ProtectedRoute permission="manage_stores" fallback="denied"><Stores /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute permission="manage_settings" fallback="denied"><Settings /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </PageBoundary>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
