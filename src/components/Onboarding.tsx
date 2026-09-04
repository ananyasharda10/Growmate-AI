import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input, Select, Label } from "./ui/Field";
import type { Currency } from "../types";

export function OnboardingChecklist() {
  const { t } = useT();
  const settings = useStore((s) => s.settings);
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const expenses = useStore((s) => s.expenses);
  const updateSettings = useStore((s) => s.updateSettings);

  const [name, setName] = useState(settings.businessName);
  const [currency, setCurrency] = useState<Currency>(settings.currency);
  const [opening, setOpening] = useState(settings.openingCashBalance);

  const steps = [
    { label: t("onboarding.stepAddBusinessName"), done: settings.onboardingSetupDone },
    { label: t("onboarding.stepSelectCurrency"), done: settings.onboardingSetupDone },
    { label: t("onboarding.stepEnterOpeningCash"), done: settings.onboardingSetupDone },
    { label: t("onboarding.stepAddFirstProduct"), done: products.length > 0 },
    { label: t("onboarding.stepRecordFirstSale"), done: sales.length > 0 },
    { label: t("onboarding.stepAddFirstExpense"), done: expenses.length > 0 },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone || settings.onboardingDismissed) return null;

  function saveSetup() {
    updateSettings({
      businessName: name.trim() || "My Business",
      currency,
      openingCashBalance: opening,
      onboardingSetupDone: true,
    });
  }

  return (
    <Card className="mb-6 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t("onboarding.title")}</h2>
          <p className="text-sm text-gray-500">{t("onboarding.subtitle", { appName: t("common.appName") })}</p>
        </div>
        <button
          onClick={() => updateSettings({ onboardingDismissed: true })}
          className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600"
        >
          {t("onboarding.dismiss")}
        </button>
      </div>

      {!settings.onboardingSetupDone && (
        <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl bg-brand-50 p-4 sm:grid-cols-3">
          <div>
            <Label>{t("onboarding.businessNameLabel")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("onboarding.businessNamePlaceholder")} />
          </div>
          <div>
            <Label>{t("onboarding.currencyLabel")}</Label>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
            </Select>
          </div>
          <div>
            <Label>{t("onboarding.openingCashLabel")}</Label>
            <Input type="number" value={opening} onChange={(e) => setOpening(Number(e.target.value))} />
          </div>
          <div className="sm:col-span-3">
            <Button onClick={saveSetup}>{t("onboarding.saveContinueBtn")}</Button>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2 text-sm">
            {step.done ? (
              <CheckCircle2 size={18} className="text-brand-600" />
            ) : (
              <Circle size={18} className="text-gray-300" />
            )}
            <span className={step.done ? "text-gray-400 line-through" : "text-gray-700"}>{step.label}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
