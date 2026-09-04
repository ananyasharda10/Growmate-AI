import { useState } from "react";
import { Outlet } from "react-router-dom";
import { X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { WelcomeTour } from "../WelcomeTour";
import { useStore } from "../../store/useStore";
import { useT } from "../../lib/i18n/useT";
import { LogoMark } from "../ui/Logo";

export function AppLayout() {
  const hydrated = useStore((s) => s.hydrated);
  const { t } = useT();

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <div className="flex flex-col items-center gap-3">
          <LogoMark size={40} />
          <p className="text-sm text-gray-500">{t("layout.loadingBusiness")}</p>
        </div>
      </div>
    );
  }

  return <AppShell />;
}

function AppShell() {
  const syncError = useStore((s) => s.syncError);
  const dismissSyncError = useStore((s) => s.dismissSyncError);
  const hasSeenTour = useStore((s) => s.settings.hasSeenTour);
  const updateSettings = useStore((s) => s.updateSettings);
  const [tourOpen, setTourOpen] = useState(!hasSeenTour);

  function closeTour() {
    setTourOpen(false);
    if (!hasSeenTour) updateSettings({ hasSeenTour: true });
  }

  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar onShowTour={() => setTourOpen(true)} />
      <main className="flex-1 overflow-y-auto px-10 py-8">
        {syncError && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{syncError}</span>
            <button onClick={dismissSyncError} className="cursor-pointer rounded-md p-1 text-red-400 hover:text-red-600">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
      <WelcomeTour open={tourOpen} onClose={closeTour} />
    </div>
  );
}
