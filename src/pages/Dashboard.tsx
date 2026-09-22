import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  Coins,
  PackagePlus,
  Receipt,
  Share2,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { OnboardingChecklist } from "../components/Onboarding";
import { formatMoney } from "../lib/currency";
import { todayISO, addDays, localDateOf } from "../lib/id";
import {
  buildRestockSuggestions,
  cashOnHand,
  cashPaidForExpenses,
  dueAmountRemaining,
  duePaymentsTotal,
  isDueOverdue,
  isExpiringSoon,
  marginAmount,
  cashReceivedFromSales,
  moveSpeed,
} from "../lib/calculations";

export function Dashboard() {
  const { t, language } = useT();
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const expenses = useStore((s) => s.expenses);
  const dues = useStore((s) => s.dues);
  const settings = useStore((s) => s.settings);
  const currency = settings.currency;

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return t("dashboard.greetingMorning");
    if (h < 17) return t("dashboard.greetingAfternoon");
    return t("dashboard.greetingEvening");
  }

  const stockValue = products.filter((p) => !p.archived).reduce((sum, p) => sum + p.stock * p.cost, 0);

  const today = todayISO();
  const todaysSales = sales.filter((s) => localDateOf(s.date) === today);
  const todaysSalesTotal = todaysSales.reduce((sum, s) => sum + s.total, 0);

  const cash = cashOnHand(settings.openingCashBalance, sales, expenses, dues);

  const pendingCustomerDues = dues.filter((d) => d.type === "customer" && d.status !== "settled");
  const pendingSupplierDues = dues.filter((d) => d.type === "supplier" && d.status !== "settled");
  const pendingCustomerTotal = pendingCustomerDues.reduce((s, d) => s + dueAmountRemaining(d), 0);
  const pendingSupplierTotal = pendingSupplierDues.reduce((s, d) => s + dueAmountRemaining(d), 0);

  const lowStock = products.filter((p) => !p.archived && p.stock <= p.reorderLevel);
  const expiring = products.filter((p) => !p.archived && isExpiringSoon(p));

  const upcomingSupplierDueTotal = pendingSupplierDues
    .filter((d) => !d.dueDate || d.dueDate <= addDays(today, 7))
    .reduce((s, d) => s + dueAmountRemaining(d), 0);

  const restockSuggestions = useMemo(
    () => buildRestockSuggestions(products, sales, cash, upcomingSupplierDueTotal),
    [products, sales, cash, upcomingSupplierDueTotal]
  );

  const slow = moveSpeed(products, sales).filter((m) => m.speed === "Slow" && m.product.stock > m.product.reorderLevel);

  // Same formula as Money In/Out's "Money Out" total, so the two never disagree.
  const moneyOutTotal = cashPaidForExpenses(expenses) + duePaymentsTotal(dues, "supplier");

  const profitTracked = sales.reduce((sum, s) => {
    if (!s.productId) return sum;
    // Use the cost recorded at the time of sale, not the product's current cost, so
    // editing a product's price later doesn't rewrite already-recorded profit history.
    // Older sales recorded before this field existed fall back to the current cost.
    const product = products.find((p) => p.id === s.productId);
    const costAtSale = s.unitCost ?? product?.cost;
    if (costAtSale === undefined) return sum;
    return sum + marginAmount(costAtSale, s.unitPrice) * s.quantity;
  }, 0);

  type Action = { icon: React.ReactNode; tone: "red" | "amber" | "gray"; text: string; to: string };
  const actions: Action[] = [];

  for (const d of pendingCustomerDues.filter((d) => isDueOverdue(d)).slice(0, 2)) {
    const days = Math.abs(Math.round((new Date(today).getTime() - new Date(d.dueDate!).getTime()) / 86400000));
    actions.push({
      icon: <Coins size={16} />,
      tone: "red",
      text: t("dashboard.actionCollect", { amount: formatMoney(dueAmountRemaining(d), currency), name: d.name, days, s: days === 1 ? "" : "s" }),
      to: "/dues",
    });
  }

  for (const r of restockSuggestions.slice(0, 2)) {
    actions.push({
      icon: <PackagePlus size={16} />,
      tone: "amber",
      text: t("dashboard.actionRestock", { name: r.product.name, stock: r.currentStock, unit: t(`enums.unit.${r.product.unit}`) }),
      to: "/advisor",
    });
  }

  for (const s of slow.slice(0, 1)) {
    actions.push({
      icon: <TrendingDown size={16} />,
      tone: "gray",
      text: t("dashboard.actionDontReorder", { name: s.product.name }),
      to: "/analytics",
    });
  }

  for (const p of expiring.slice(0, 1)) {
    actions.push({
      icon: <CalendarClock size={16} />,
      tone: "amber",
      text: t("dashboard.actionExpiring", { name: p.name }),
      to: "/inventory",
    });
  }

  // This week's sales, Mon-Sun straight bar chart
  const weekData = useMemo(() => {
    const days: { key: string; label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dateKey = addDays(today, -i);
      const label = new Date(dateKey).toLocaleDateString(language === "hi" ? "hi-IN" : "en-US", { weekday: "short" });
      days.push({ key: dateKey, label, total: 0 });
    }
    const map = new Map(days.map((d, idx) => [d.key, idx]));
    for (const s of sales) {
      const key = localDateOf(s.date);
      const idx = map.get(key);
      if (idx !== undefined) days[idx].total += s.total;
    }
    return days;
  }, [sales, today, language]);

  const topSellersThisWeek = useMemo(() => {
    const qty = new Map<string, number>();
    for (const s of sales) {
      if (!s.productId || !weekData.some((d) => d.key === localDateOf(s.date))) continue;
      qty.set(s.productId, (qty.get(s.productId) ?? 0) + s.quantity);
    }
    return [...qty.entries()]
      .map(([productId, q]) => ({ product: products.find((p) => p.id === productId), q }))
      .filter((x) => x.product && !x.product.archived)
      .sort((a, b) => b.q - a.q)
      .slice(0, 5) as { product: typeof products[number]; q: number }[];
  }, [sales, products, weekData]);

  const isEmpty = products.length === 0 && sales.length === 0;

  const cashReceivedToday = cashReceivedFromSales(todaysSales);
  const expensesToday = expenses.filter((e) => localDateOf(e.date) === today).reduce((s, e) => s + e.amount, 0);
  const creditAddedToday = dues
    .filter((d) => d.type === "customer" && d.autoCreated && localDateOf(d.createdAt) === today)
    .reduce((s, d) => s + d.originalAmount, 0);
  const overdueCustomerTotal = pendingCustomerDues.filter((d) => isDueOverdue(d)).reduce((s, d) => s + dueAmountRemaining(d), 0);

  const summaryLines = [
    t("dashboard.summaryToday", { date: today }),
    t("dashboard.summarySales", { amount: formatMoney(todaysSalesTotal, currency) }),
    t("dashboard.summaryCashReceived", { amount: formatMoney(cashReceivedToday, currency) }),
    t("dashboard.summaryExpenses", { amount: formatMoney(expensesToday, currency) }),
    t("dashboard.summaryCreditAdded", { amount: formatMoney(creditAddedToday, currency) }),
    t("dashboard.summaryCashOnHand", { amount: formatMoney(cash, currency) }),
    t("dashboard.summaryNeedRestock", { count: lowStock.length, s: lowStock.length === 1 ? "" : "s" }),
    t("dashboard.summaryOverdue", { amount: formatMoney(overdueCustomerTotal, currency) }),
  ];
  const summaryText = summaryLines.join("\n");

  async function shareSummary() {
    if (navigator.share) {
      try {
        await navigator.share({ title: t("dashboard.shareTitle", { appName: t("common.appName") }), text: summaryText });
        return;
      } catch {
        // user cancelled or share unsupported at runtime, fall through to WhatsApp
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(summaryText)}`, "_blank");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("dashboard.greeting", { greeting: greeting() })}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("dashboard.subtitle")}</p>
      </div>

      <OnboardingChecklist />

      {actions.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("dashboard.todaysActions")}</h2>
          <ul className="space-y-2">
            {actions.map((a, i) => (
              <li key={i}>
                <Link
                  to={a.to}
                  className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm font-medium hover:opacity-80 ${
                    a.tone === "red"
                      ? "border-red-100 bg-red-50 text-red-700"
                      : a.tone === "amber"
                      ? "border-amber-100 bg-amber-50 text-amber-800"
                      : "border-gray-100 bg-gray-50 text-gray-600"
                  }`}
                >
                  {a.icon}
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link to="/money">
          <Button variant="secondary" fullWidth icon={<ShoppingCart size={16} />}>
            {t("dashboard.recordSale")}
          </Button>
        </Link>
        <Link to="/money">
          <Button variant="secondary" fullWidth icon={<Receipt size={16} />}>
            {t("dashboard.recordExpense")}
          </Button>
        </Link>
        <Link to="/inventory">
          <Button variant="secondary" fullWidth icon={<PackagePlus size={16} />}>
            {t("dashboard.addStock")}
          </Button>
        </Link>
        <Link to="/dues">
          <Button variant="secondary" fullWidth icon={<UserPlus size={16} />}>
            {t("dashboard.addDue")}
          </Button>
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("dashboard.statStockValue")} value={formatMoney(stockValue, currency)} icon={<Coins size={18} />} />
        <StatCard label={t("dashboard.statTodaysSales")} value={formatMoney(todaysSalesTotal, currency)} icon={<TrendingUp size={18} />} />
        <StatCard label={t("dashboard.statCashBalance")} value={formatMoney(cash, currency)} icon={<Wallet size={18} />} />
        <StatCard
          label={t("dashboard.statPendingDues")}
          value={formatMoney(pendingCustomerTotal, currency)}
          icon={<AlertTriangle size={18} />}
          sub={t("dashboard.statPendingDuesSub", { in: formatMoney(pendingCustomerTotal, currency), out: formatMoney(pendingSupplierTotal, currency) })}
        />
      </div>

      <Card className="mb-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{t("dashboard.savedTitle", { appName: t("common.appName") })}</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MiniStat label={t("dashboard.miniRestocks")} value={formatMoney(0, currency)} />
          <MiniStat label={t("dashboard.miniProfit")} value={formatMoney(profitTracked, currency)} />
          <MiniStat label={t("dashboard.miniExpenses")} value={formatMoney(moneyOutTotal, currency)} />
        </div>
        <p className="mt-3 flex items-center gap-1 text-xs text-gray-400">{t("dashboard.poweredBy")}</p>
      </Card>

      <Card className="mb-6 p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{t("dashboard.dailySummary")}</h2>
          <Button variant="secondary" icon={<Share2 size={15} />} onClick={shareSummary}>
            {t("dashboard.shareSummary")}
          </Button>
        </div>
        <pre className="whitespace-pre-wrap rounded-xl bg-gray-50 p-4 font-sans text-sm text-gray-600">{summaryText}</pre>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">{t("dashboard.weekSales")}</h2>
          {weekData.every((d) => d.total === 0) ? (
            <EmptyState text={t("dashboard.noSalesWeek")} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
                <Bar dataKey="total" fill="#2f8f52" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">{t("dashboard.topSellersWeek")}</h2>
          {topSellersThisWeek.length === 0 ? (
            <EmptyState text={t("dashboard.noSalesWeek")} />
          ) : (
            <ul className="space-y-3">
              {topSellersThisWeek.map(({ product, q }) => (
                <li key={product.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{product.name}</span>
                  <span className="text-gray-500">
                    {q} {t(`enums.unit.${product.unit}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">{t("dashboard.runningLow")}</h2>
            {lowStock.length > 0 && <Badge tone="amber">{t("dashboard.itemsCount", { count: lowStock.length, s: lowStock.length > 1 ? "s" : "" })}</Badge>}
          </div>
          {lowStock.length === 0 ? (
            <EmptyState text={t("dashboard.allStockHealthy")} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-500">{t("dashboard.reorderAt", { level: p.reorderLevel })}</p>
                  </div>
                  <Badge tone="red">{t("dashboard.leftSuffix", { stock: p.stock })}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">{t("dashboard.expiringSoon")}</h2>
            {expiring.length > 0 && <Badge tone="amber">{t("dashboard.itemsCount", { count: expiring.length, s: expiring.length > 1 ? "s" : "" })}</Badge>}
          </div>
          {expiring.length === 0 ? (
            <EmptyState text={t("dashboard.nothingExpiring")} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {expiring.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-500">{t("dashboard.inStockSuffix", { stock: p.stock, unit: t(`enums.unit.${p.unit}`) })}</p>
                  </div>
                  <Badge tone="amber">{t("dashboard.expiresOn", { date: p.expiryDate ?? "" })}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {isEmpty && (
        <Card className="mt-6 p-8 text-center">
          <p className="text-sm text-gray-500">
            {t("dashboard.emptyDashboardPre")}
            <Link to="/settings" className="font-semibold text-brand-700 hover:underline">
              {t("dashboard.emptyDashboardLink")}
            </Link>
            {t("dashboard.emptyDashboardPost")}
          </p>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, sub }: { label: string; value: string; icon: React.ReactNode; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-brand-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-brand-700">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-xl bg-brand-50/60 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}
