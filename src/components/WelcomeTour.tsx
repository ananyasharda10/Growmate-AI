import { useState } from "react";
import {
  LayoutGrid,
  Package,
  Wallet,
  Users,
  BarChart3,
  Sparkles,
  Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "./ui/Button";
import { LogoMark } from "./ui/Logo";
import { useT } from "../lib/i18n/useT";

const STEPS = [
  { key: "welcome", icon: <LogoMark size={64} /> },
  { key: "dashboard", icon: <LayoutGrid size={22} /> },
  { key: "inventory", icon: <Package size={22} /> },
  { key: "money", icon: <Wallet size={22} /> },
  { key: "dues", icon: <Users size={22} /> },
  { key: "analytics", icon: <BarChart3 size={22} /> },
  { key: "advisor", icon: <Sparkles size={22} /> },
  { key: "settings", icon: <SettingsIcon size={22} /> },
] as const;

export function WelcomeTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const [step, setStep] = useState(0);

  if (!open) return null;

  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const title = current.key === "welcome" ? t("tour.welcomeTitle", { appName: t("common.appName") }) : t(`tour.${current.key}Title`);
  const description = current.key === "welcome" ? t("tour.welcomeDesc") : t(`tour.${current.key}Desc`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="px-6 pb-2 pt-6">
          {isFirst ? (
            <div className="mb-4">{current.icon}</div>
          ) : (
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white">
              {current.icon}
            </div>
          )}
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{description}</p>
        </div>

        <div className="flex items-center justify-center gap-1.5 py-4">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-5 bg-brand-600" : "w-1.5 bg-gray-200"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600"
          >
            {t("tour.skipTour")}
          </button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                {t("tour.back")}
              </Button>
            )}
            {isLast ? (
              <Button onClick={onClose}>{t("tour.getStarted")}</Button>
            ) : (
              <Button onClick={() => setStep((s) => s + 1)}>{t("tour.next")}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
