import { useState } from "react";
import { Download, RefreshCcw, RotateCcw, Trash2 } from "lucide-react";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { supabase } from "../lib/supabaseClient";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label, NumberInput, Select } from "../components/ui/Field";
import { ConfirmDialog } from "../components/ui/Modal";
import { LanguageToggle } from "../components/LanguageToggle";
import { BUSINESS_TYPE_VALUES, type BusinessType, type Currency, type Product } from "../types";

function downloadCSV(filename: string, rows: (string | number | undefined)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Settings() {
  const { t } = useT();
  const session = useStore((s) => s.session);
  const isDemo = useStore((s) => s.isDemo);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const expenses = useStore((s) => s.expenses);
  const dues = useStore((s) => s.dues);
  const resetDemoData = useStore((s) => s.resetDemoData);
  const restoreProduct = useStore((s) => s.restoreProduct);
  const permanentlyDeleteProduct = useStore((s) => s.permanentlyDeleteProduct);

  const [businessName, setBusinessName] = useState(settings.businessName);
  const [businessType, setBusinessType] = useState<BusinessType>(settings.businessType);
  const [currency, setCurrency] = useState<Currency>(settings.currency);
  const [lowStock, setLowStock] = useState(settings.defaultLowStockLevel);
  const [opening, setOpening] = useState(settings.openingCashBalance);
  const [businessError, setBusinessError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");

  const [confirmDemoReset, setConfirmDemoReset] = useState(false);
  const [deleteForeverTarget, setDeleteForeverTarget] = useState<Product | null>(null);

  const archivedProducts = products.filter((p) => p.archived);
  // Switching currency only ever changed the displayed symbol — every amount already
  // recorded stayed the same number, silently relabeled into a different currency. Since
  // there's no exchange-rate conversion here, the only safe fix is to stop letting the
  // currency change once there's real data it would mislabel.
  const hasData = products.length > 0 || sales.length > 0 || expenses.length > 0 || dues.length > 0;

  function saveBusiness() {
    if (lowStock < 0 || opening < 0) {
      setBusinessError(t("settings.invalidNegativeValue"));
      return;
    }
    setBusinessError("");
    updateSettings({
      businessName: businessName.trim() || "My Business",
      businessType,
      currency,
      defaultLowStockLevel: lowStock,
      openingCashBalance: opening,
      onboardingSetupDone: true,
    });
  }

  async function updatePassword() {
    setPasswordMsg("");
    if (isDemo) {
      setPasswordMsg(t("settings.demoNoPassword"));
      return;
    }
    if (!newPassword || newPassword !== confirmPassword) {
      setPasswordMsg(t("settings.passwordMismatch"));
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMsg(error.message);
      return;
    }
    setPasswordMsg(t("settings.passwordUpdated"));
    setNewPassword("");
    setConfirmPassword("");
  }

  function exportAll() {
    downloadCSV("products.csv", [
      ["name", "unit", "cost", "sell", "stock", "reorderLevel", "expiryDate", "supplier", "archived"],
      ...products.map((p) => [p.name, p.unit, p.cost, p.sell, p.stock, p.reorderLevel, p.expiryDate, p.supplier, String(p.archived)]),
    ]);
    downloadCSV("sales.csv", [
      ["date", "product", "quantity", "unitPrice", "total", "paymentMethod", "customerName"],
      ...sales.map((s) => [s.date, s.productName, s.quantity, s.unitPrice, s.total, s.paymentMethod, s.customerName]),
    ]);
    downloadCSV("expenses.csv", [
      ["date", "category", "amount", "paymentMethod", "supplierName", "note"],
      ...expenses.map((e) => [e.date, e.category, e.amount, e.paymentMethod, e.supplierName, e.note]),
    ]);
    downloadCSV("dues.csv", [
      ["type", "name", "originalAmount", "amountPaid", "status", "dueDate"],
      ...dues.map((d) => [d.type, d.name, d.originalAmount, d.payments.reduce((s, p) => s + p.amount, 0), d.status, d.dueDate]),
    ]);
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("settings.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("settings.subtitle")}</p>
        </div>
      </div>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{t("settings.accountTitle")}</h2>
        <p className="text-sm text-gray-600">{t("settings.emailPrefix", { email: session?.email ?? "" })}</p>
        <p className="text-sm text-gray-600">{t("settings.roleLine")}</p>
        <div className="mt-4">
          <Label>{t("settings.languageLabel")}</Label>
          <LanguageToggle />
        </div>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{t("settings.businessTitle")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("settings.businessNameLabel")}</Label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div>
            <Label>{t("settings.businessTypeLabel")}</Label>
            <Select value={businessType} onChange={(e) => setBusinessType(e.target.value as BusinessType)}>
              {BUSINESS_TYPE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {t(`enums.businessType.${v}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t("settings.currencyLabel")}</Label>
            <Select value={currency} disabled={hasData} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
            </Select>
            {hasData && <p className="mt-1 text-xs text-gray-400">{t("settings.currencyLockedNote")}</p>}
          </div>
          <div>
            <Label>{t("settings.defaultLowStockLabel")}</Label>
            <NumberInput value={lowStock} onChange={setLowStock} />
          </div>
          <div>
            <Label>{t("settings.openingCashLabel")}</Label>
            <NumberInput value={opening} onChange={setOpening} />
          </div>
        </div>
        {businessError && <p className="mt-2 text-sm text-red-600">{businessError}</p>}
        <Button className="mt-4" onClick={saveBusiness}>
          {t("settings.saveChangesBtn")}
        </Button>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{t("settings.passwordTitle")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{t("settings.newPasswordLabel")}</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <Label>{t("settings.confirmPasswordLabel")}</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
        </div>
        {passwordMsg && <p className="mt-2 text-sm text-gray-600">{passwordMsg}</p>}
        <Button className="mt-4" onClick={updatePassword}>
          {t("settings.updatePasswordBtn")}
        </Button>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-1 text-base font-semibold text-gray-900">{t("settings.archivedProductsTitle")}</h2>
        <p className="mb-4 text-sm text-gray-500">{t("settings.archivedProductsSubtitle")}</p>
        {archivedProducts.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">{t("settings.noArchivedProducts")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {archivedProducts.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" icon={<RotateCcw size={14} />} onClick={() => restoreProduct(p.id)}>
                    {t("settings.restoreBtn")}
                  </Button>
                  <Button variant="outline" icon={<Trash2 size={14} />} onClick={() => setDeleteForeverTarget(p)}>
                    {t("settings.deleteForeverBtn")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{t("settings.dataTitle")}</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" icon={<Download size={16} />} onClick={exportAll}>
            {t("settings.exportCsvBtn")}
          </Button>
          <Button variant="outline" icon={<RefreshCcw size={16} />} onClick={() => setConfirmDemoReset(true)}>
            {t("settings.loadResetDemoBtn")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-400">{t("settings.resetDemoNote")}</p>
      </Card>

      <ConfirmDialog
        open={confirmDemoReset}
        title={t("settings.confirmResetTitle")}
        message={t("settings.confirmResetMsg")}
        confirmLabel={t("settings.resetBtn")}
        danger
        onConfirm={() => {
          resetDemoData();
          setConfirmDemoReset(false);
        }}
        onCancel={() => setConfirmDemoReset(false)}
      />

      <ConfirmDialog
        open={!!deleteForeverTarget}
        title={t("settings.deleteForeverTitle")}
        message={t("settings.deleteForeverMsg", { name: deleteForeverTarget?.name ?? "" })}
        confirmLabel={t("settings.deleteForeverBtn")}
        danger
        onConfirm={() => {
          if (deleteForeverTarget) permanentlyDeleteProduct(deleteForeverTarget.id);
          setDeleteForeverTarget(null);
        }}
        onCancel={() => setDeleteForeverTarget(null)}
      />
    </div>
  );
}
