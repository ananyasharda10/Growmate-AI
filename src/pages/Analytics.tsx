import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { formatMoney } from "../lib/currency";
import { bestMargins, moneyInOutByMonth, moveSpeed, topEarnersByRevenue, topSellersByUnits } from "../lib/calculations";

export function Analytics() {
  const { t, language } = useT();
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const expenses = useStore((s) => s.expenses);
  const dues = useStore((s) => s.dues);
  const currency = useStore((s) => s.settings.currency);

  const monthly = moneyInOutByMonth(sales, expenses, dues, 6, language === "hi" ? "hi-IN" : "en-US");
  const topSellers = topSellersByUnits(sales, products);
  const topEarners = topEarnersByRevenue(sales, products);
  const margins = bestMargins(products);
  const speed = moveSpeed(products, sales);

  const hasAnyMoney = monthly.some((m) => m.moneyIn > 0 || m.moneyOut > 0);
  const numberLocale = language === "hi" ? "hi-IN" : "en-US";
  const moneyLocale = currency === "INR" ? "en-IN" : "en-US";
  const formatAxisMoney = (v: number) => Number(v).toLocaleString(moneyLocale);
  const formatAxisNumber = (v: number) => Number(v).toLocaleString(numberLocale);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("analytics.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("analytics.subtitle")}</p>
      </div>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{t("analytics.moneyInOutTitle")}</h2>
        {!hasAnyMoney ? (
          <EmptyState text={t("analytics.noMoneyRecorded")} />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={formatAxisMoney} />
              <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
              <Legend />
              <Bar name={t("analytics.legendMoneyIn")} dataKey="moneyIn" fill="#2f8f52" radius={[6, 6, 0, 0]} />
              <Bar name={t("analytics.legendMoneyOut")} dataKey="moneyOut" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">{t("analytics.topSellersUnitsTitle")}</h2>
          {topSellers.length === 0 ? (
            <EmptyState text={t("analytics.noSales")} />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, topSellers.length * 44)}>
              <BarChart data={topSellers.map((ts) => ({ name: ts.product.name, qty: ts.qty }))} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={formatAxisNumber} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: "#374151" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="qty" fill="#2f8f52" radius={[0, 6, 6, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">{t("analytics.topEarnersTitle")}</h2>
          {topEarners.length === 0 ? (
            <EmptyState text={t("analytics.noSales")} />
          ) : (
            <ul className="space-y-2">
              {topEarners.map(({ product, revenue }) => (
                <li key={product.id} className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
                  <span className="font-medium text-gray-800">{product.name}</span>
                  <span className="font-semibold text-brand-700">{formatMoney(revenue, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">{t("analytics.bestMarginsTitle")}</h2>
          {margins.length === 0 ? (
            <EmptyState text={t("analytics.addProductsMargins")} />
          ) : (
            <ul className="space-y-2">
              {margins.map(({ product, marginPct, marginAmt }) => (
                <li key={product.id} className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
                  <span className="font-medium text-gray-800">{product.name}</span>
                  <span className="font-semibold text-brand-700">
                    {marginPct.toFixed(0)}% · {formatMoney(marginAmt, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">{t("analytics.moveSpeedTitle")}</h2>
          {speed.length === 0 ? (
            <EmptyState text={t("analytics.addProductsMovement")} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {speed.map(({ product, sold, speed: label }) => (
                <li key={product.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{product.name}</p>
                    <p className="text-xs text-gray-400">{t("analytics.soldInStock", { sold, stock: product.stock })}</p>
                  </div>
                  <Badge tone={label === "Fast" ? "green" : "gray"}>{t(`enums.speed.${label}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex h-32 items-center justify-center rounded-xl bg-brand-50/60 text-center text-sm text-gray-500">{text}</div>;
}
