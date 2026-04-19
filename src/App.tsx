import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import AppShell from "@/app/(app)/AppShell";
import Landing from "@/app/(marketing)/Landing";
import Features from "@/app/(marketing)/Features";
import Pricing from "@/app/(marketing)/Pricing";
import Login from "@/app/(auth)/Login";
import Signup from "@/app/(auth)/Signup";
import ForgotPassword from "@/app/(auth)/ForgotPassword";
import ResetPassword from "@/app/(auth)/ResetPassword";
import AcceptInvite from "@/app/(auth)/AcceptInvite";
import Dashboard from "@/app/(app)/Dashboard";
import Rota from "@/app/(app)/Rota";
import Leave from "@/app/(app)/Leave";
import Team from "@/app/(app)/Team";
import Stores from "@/app/(app)/Stores";
import Profile from "@/app/(app)/Profile";
import Settings from "@/app/(app)/Settings";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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

            {/* Protected app */}
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/rota" element={<Rota />} />
              <Route path="/leave" element={<Leave />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            {/* Protected manager-only */}
            <Route
              element={
                <ProtectedRoute roles={["owner", "manager"]}>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/team" element={<Team />} />
              <Route path="/stores" element={<Stores />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
