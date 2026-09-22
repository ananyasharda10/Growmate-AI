import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useStore } from "./store/useStore";
import { supabase } from "./lib/supabaseClient";
import { AppLayout } from "./components/Layout/AppLayout";
import { Auth } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { MoneyInOut } from "./pages/MoneyInOut";
import { Dues } from "./pages/Dues";
import { Analytics } from "./pages/Analytics";
import { AIAdvisor } from "./pages/AIAdvisor";
import { Settings } from "./pages/Settings";
import { NotFound } from "./pages/NotFound";
import { ForgotPassword } from "./pages/ForgotPassword";
import { About } from "./pages/marketing/About";
import { Pricing } from "./pages/marketing/Pricing";
import { Terms } from "./pages/marketing/Terms";
import { Privacy } from "./pages/marketing/Privacy";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const session = useStore((s) => s.session);
  if (!session) return <Navigate to="/auth" replace />;
  return children;
}

export default function App() {
  const session = useStore((s) => s.session);
  const setSessionFromSupabase = useStore((s) => s.setSessionFromSupabase);
  const hydrate = useStore((s) => s.hydrate);
  const clearAllData = useStore((s) => s.clearAllData);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        if (user) {
          setSessionFromSupabase(user.id, user.email ?? "", user.user_metadata?.name);
          void hydrate(user.id);
        }
      })
      .catch(() => {
        // Supabase not configured yet (see .env.example) or unreachable — fall back to
        // the Auth page instead of leaving the app stuck on a blank screen.
      })
      .finally(() => setCheckingSession(false));

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "SIGNED_OUT") {
        if (!useStore.getState().isDemo) clearAllData();
        return;
      }
      const user = newSession?.user;
      if (user && useStore.getState().session?.id !== user.id) {
        setSessionFromSupabase(user.id, user.email ?? "", user.user_metadata?.name);
        void hydrate(user.id);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, [setSessionFromSupabase, hydrate, clearAllData]);

  if (checkingSession) return null;

  return (
    <Routes>
      <Route path="/auth" element={session ? <Navigate to="/" replace /> : <Auth />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/about" element={<About />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="money" element={<MoneyInOut />} />
        <Route path="dues" element={<Dues />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="advisor" element={<AIAdvisor />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
