import { useState } from "react";
import { Download, RefreshCcw, RotateCcw, Trash2 } from "lucide-react";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { supabase } from "../lib/supabaseClient";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label, NumberInput, Select } from "../components/ui/Field";
import { ConfirmDialog, Modal } from "../components/ui/Modal";
import { LanguageToggle } from "../components/LanguageToggle";
import { BUSINESS_TYPE_VALUES, type BusinessType, type Currency, type Product } from "../types";

const MAX_BUSINESS_NAME_LENGTH = 100;

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
  const convertCurrency = useStore((s) => s.convertCurrency);
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
  const [exportMsg, setExportMsg] = useState("");
  const [pendingCurrency, setPendingCurrency] = useState<Currency | null>(null);
  const [exchangeRate, setExchangeRate] = useState(83);
  const [convertedMsg, setConvertedMsg] = useState("");

  const archivedProducts = products.filter((p) => p.archived);
  // Whether switching currency would actually change any recorded amount — if nothing has
  // been entered yet (a fresh account, or opening cash still at 0), there's nothing to
  // convert and the currency can just switch outright.
  const hasConvertibleData =
    products.length > 0 || sales.length > 0 || expenses.length > 0 || dues.length > 0 || settings.openingCashBalance !== 0;

  function saveBusiness() {
    if (!businessName.trim()) {
      setBusinessError(t("settings.nameRequired"));
      return;
    }
    if (lowStock <= 0) {
      setBusinessError(t("settings.lowStockMustBePositive"));
      return;
    }
    if (opening < 0) {
      setBusinessError(t("settings.invalidNegativeValue"));
      return;
    }
    setBusinessError("");
    updateSettings({
      businessName: businessName.trim(),
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

  async function exportAll() {
    setExportMsg("");
    // Browsers block several near-simultaneous programmatic downloads triggered from one
    // click (only the first one or two go through, the rest are silently dropped) — a short
    // stagger between each file avoids that, so all four CSVs actually download.
    const files: [string, (string | number | undefined)[][]][] = [
      [
        "products.csv",
        [
          ["name", "unit", "cost", "sell", "stock", "reorderLevel", "expiryDate", "supplier", "archived"],
          ...products.map((p) => [p.name, p.unit, p.cost, p.sell, p.stock, p.reorderLevel, p.expiryDate, p.supplier, String(p.archived)]),
        ],
      ],
      [
        "sales.csv",
        [
          ["date", "product", "quantity", "unitPrice", "total", "paymentMethod", "customerName"],
          ...sales.map((s) => [s.date, s.productName, s.quantity, s.unitPrice, s.total, s.paymentMethod, s.customerName]),
        ],
      ],
      [
        "expenses.csv",
        [
          ["date", "category", "amount", "paymentMethod", "supplierName", "note"],
          ...expenses.map((e) => [e.date, e.category, e.amount, e.paymentMethod, e.supplierName, e.note]),
        ],
      ],
      [
        "dues.csv",
        [
          ["type", "name", "originalAmount", "amountPaid", "status", "dueDate"],
          ...dues.map((d) => [d.type, d.name, d.originalAmount, d.payments.reduce((s, p) => s + p.amount, 0), d.status, d.dueDate]),
        ],
      ],
    ];
    for (const [filename, rows] of files) {
      downloadCSV(filename, rows);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    setExportMsg(t("settings.exportDoneMsg"));
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
            <Input maxLength={MAX_BUSINESS_NAME_LENGTH} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
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
            <Select
              value={currency}
              onChange={(e) => {
                const next = e.target.value as Currency;
                if (next === currency) return;
                if (hasConvertibleData) {
                  // Needs an exchange rate before anything actually changes, so this opens
                  // a confirmation instead of applying immediately — unlike every other
                  // field here, applying then letting the modal roll it back would mean
                  // briefly showing converted-looking amounts under the old currency symbol.
                  setPendingCurrency(next);
                  return;
                }
                setCurrency(next);
                updateSettings({ currency: next });
              }}
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
            </Select>
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
        {exportMsg && <p className="mt-2 text-sm text-brand-700">{exportMsg}</p>}
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

      <Modal open={!!pendingCurrency} onClose={() => setPendingCurrency(null)} title={t("settings.convertCurrencyTitle")}>
        {pendingCurrency && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {t("settings.convertCurrencyMsg", {
                from: currency === "INR" ? "₹" : "$",
                to: pendingCurrency === "INR" ? "₹" : "$",
              })}
            </p>
            <p className="text-xs text-gray-400">{t("settings.convertRoundingNote")}</p>
            <div>
              <Label>{t("settings.exchangeRateLabel")}</Label>
              <NumberInput value={exchangeRate} onChange={setExchangeRate} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" fullWidth onClick={() => setPendingCurrency(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                fullWidth
                disabled={exchangeRate <= 0}
                onClick={() => {
                  convertCurrency(pendingCurrency, exchangeRate);
                  setCurrency(pendingCurrency);
                  setConvertedMsg(
                    t("settings.convertedMsg", {
                      currency: pendingCurrency === "INR" ? "₹" : "$",
                      rate: exchangeRate,
                    })
                  );
                  setPendingCurrency(null);
                }}
              >
                {t("settings.convertBtn")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!convertedMsg}
        title={t("settings.convertedTitle")}
        message={convertedMsg}
        confirmLabel={t("common.gotIt")}
        onConfirm={() => setConvertedMsg("")}
        onCancel={() => setConvertedMsg("")}
      />
    </div>
  );
}
