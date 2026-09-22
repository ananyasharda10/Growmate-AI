import type { Due, Expense, Product, Sale, StockMovement } from "../types";
import { daysBetween, todayISO } from "./id";

// ---------- Margins ----------
// Gross margin = (sell - cost) / sell. This is NOT markup, which would be (sell - cost) / cost.
export function grossMarginPercent(cost: number, sell: number): number {
  if (!sell) return 0;
  return ((sell - cost) / sell) * 100;
}

export function marginAmount(cost: number, sell: number): number {
  return sell - cost;
}

// ---------- Cash ----------
export function cashReceivedFromSales(sales: Sale[]): number {
  return sales.filter((s) => s.paymentMethod !== "credit").reduce((sum, s) => sum + s.total, 0);
}

export function cashPaidForExpenses(expenses: Expense[]): number {
  return expenses.filter((e) => e.paymentMethod !== "credit").reduce((sum, e) => sum + e.amount, 0);
}

export function duePaymentsTotal(dues: Due[], type: "customer" | "supplier"): number {
  return dues
    .filter((d) => d.type === type)
    .reduce((sum, d) => sum + d.payments.reduce((s, p) => s + p.amount, 0), 0);
}

export function cashOnHand(openingCashBalance: number, sales: Sale[], expenses: Expense[], dues: Due[]): number {
  return (
    openingCashBalance +
    cashReceivedFromSales(sales) +
    duePaymentsTotal(dues, "customer") -
    cashPaidForExpenses(expenses) -
    duePaymentsTotal(dues, "supplier")
  );
}

export function salesRevenueTotal(sales: Sale[]): number {
  return sales.reduce((sum, s) => sum + s.total, 0);
}

// ---------- Dues ----------
export function dueAmountPaid(due: Due): number {
  return due.payments.reduce((s, p) => s + p.amount, 0);
}

export function dueAmountRemaining(due: Due): number {
  return Math.max(0, due.originalAmount - dueAmountPaid(due));
}

export function isDueOverdue(due: Due, today: string = todayISO()): boolean {
  if (due.status === "settled") return false;
  if (!due.dueDate) return false;
  return due.dueDate < today;
}

// ---------- Stock velocity ----------
export function avgDailySalesQty(productId: string, sales: Sale[], windowDays = 30): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const recent = sales.filter((s) => s.productId === productId && new Date(s.date) >= cutoff);
  if (recent.length === 0) return 0;
  const totalQty = recent.reduce((sum, s) => sum + s.quantity, 0);
  return totalQty / windowDays;
}

export function estimatedDaysRemaining(stock: number, avgDailyQty: number): number | null {
  if (avgDailyQty <= 0) return null;
  return Math.max(0, Math.round(stock / avgDailyQty));
}

export function isExpiringSoon(product: Product, withinDays = 7, today: string = todayISO()): boolean {
  if (!product.expiryDate) return false;
  const d = daysBetween(today, product.expiryDate);
  return d >= 0 && d <= withinDays;
}

export function isExpired(product: Product, today: string = todayISO()): boolean {
  if (!product.expiryDate) return false;
  return product.expiryDate < today;
}

// ---------- Restock recommendations ----------
export interface RestockSuggestion {
  product: Product;
  currentStock: number;
  avgDailyQty: number;
  estimatedDaysRemaining: number | null;
  idealSuggestedQty: number;
  affordableQty: number;
  cost: number;
  cashAfterPurchase: number;
  constrained: boolean;
  upcomingSupplierDueTotal: number;
}

export function buildRestockSuggestions(
  products: Product[],
  sales: Sale[],
  cashAvailable: number,
  upcomingSupplierDueTotal: number
): RestockSuggestion[] {
  const needing = products.filter((p) => !p.archived && p.stock <= p.reorderLevel);

  let remainingCash = Math.max(0, cashAvailable - upcomingSupplierDueTotal);
  const results: RestockSuggestion[] = [];

  const sorted = [...needing].sort((a, b) => a.stock / (a.reorderLevel || 1) - b.stock / (b.reorderLevel || 1));

  for (const product of sorted) {
    const avgDailyQty = avgDailySalesQty(product.id, sales);
    const days = estimatedDaysRemaining(product.stock, avgDailyQty);
    const bySalesRate = avgDailyQty > 0 ? Math.ceil(avgDailyQty * 14) : 0;
    const byReorderLevel = Math.max(product.reorderLevel * 2 - product.stock, 0);
    const idealSuggestedQty = Math.max(bySalesRate, byReorderLevel, product.reorderLevel || 1);

    const idealCost = idealSuggestedQty * product.cost;
    let affordableQty = idealSuggestedQty;
    let constrained = false;

    if (idealCost > remainingCash) {
      constrained = true;
      affordableQty = product.cost > 0 ? Math.floor(remainingCash / product.cost) : 0;
    }

    const cost = affordableQty * product.cost;
    remainingCash = Math.max(0, remainingCash - cost);

    results.push({
      product,
      currentStock: product.stock,
      avgDailyQty,
      estimatedDaysRemaining: days,
      idealSuggestedQty,
      affordableQty,
      cost,
      cashAfterPurchase: remainingCash,
      constrained,
      upcomingSupplierDueTotal,
    });
  }

  return results;
}

// ---------- Waste / expiry ----------
export function wastedInventoryValue(movements: StockMovement[], products: Product[]): number {
  const productMap = new Map(products.map((p) => [p.id, p]));
  return movements
    .filter((m) => m.type === "expired")
    .reduce((sum, m) => {
      const product = productMap.get(m.productId);
      if (!product) return sum;
      return sum + Math.abs(m.quantity) * product.cost;
    }, 0);
}

// ---------- Analytics ----------
export function moneyInOutByMonth(sales: Sale[], expenses: Expense[], dues: Due[], months = 6, locale = "en-US") {
  const buckets: { key: string; label: string; moneyIn: number; moneyOut: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(locale, { month: "short" });
    buckets.push({ key, label, moneyIn: 0, moneyOut: 0 });
  }
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));

  const keyOf = (dateStr: string) => dateStr.slice(0, 7);

  for (const s of sales) {
    if (s.paymentMethod === "credit") continue;
    const idx = bucketIndex.get(keyOf(s.date));
    if (idx !== undefined) buckets[idx].moneyIn += s.total;
  }
  for (const e of expenses) {
    if (e.paymentMethod === "credit") continue;
    const idx = bucketIndex.get(keyOf(e.date));
    if (idx !== undefined) buckets[idx].moneyOut += e.amount;
  }
  for (const d of dues) {
    for (const p of d.payments) {
      const idx = bucketIndex.get(keyOf(p.date));
      if (idx === undefined) continue;
      if (d.type === "customer") buckets[idx].moneyIn += p.amount;
      else buckets[idx].moneyOut += p.amount;
    }
  }

  return buckets;
}

export function topSellersByUnits(sales: Sale[], products: Product[], limit = 5) {
  const qtyByProduct = new Map<string, number>();
  for (const s of sales) {
    if (!s.productId) continue;
    qtyByProduct.set(s.productId, (qtyByProduct.get(s.productId) ?? 0) + s.quantity);
  }
  const productMap = new Map(products.map((p) => [p.id, p]));
  return [...qtyByProduct.entries()]
    .map(([productId, qty]) => ({ product: productMap.get(productId), qty }))
    .filter((x) => x.product && !x.product.archived)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit) as { product: Product; qty: number }[];
}

export function topEarnersByRevenue(sales: Sale[], products: Product[], limit = 5) {
  const revByProduct = new Map<string, number>();
  for (const s of sales) {
    if (!s.productId) continue;
    revByProduct.set(s.productId, (revByProduct.get(s.productId) ?? 0) + s.total);
  }
  const productMap = new Map(products.map((p) => [p.id, p]));
  return [...revByProduct.entries()]
    .map(([productId, revenue]) => ({ product: productMap.get(productId), revenue }))
    .filter((x) => x.product && !x.product.archived)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit) as { product: Product; revenue: number }[];
}

export function bestMargins(products: Product[], limit = 5) {
  return [...products]
    .filter((p) => !p.archived)
    .map((p) => ({ product: p, marginPct: grossMarginPercent(p.cost, p.sell), marginAmt: marginAmount(p.cost, p.sell) }))
    .sort((a, b) => b.marginPct - a.marginPct)
    .slice(0, limit);
}

export function moveSpeed(products: Product[], sales: Sale[], windowDays = 30) {
  return products
    .filter((p) => !p.archived)
    .map((p) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - windowDays);
      const sold = sales
        .filter((s) => s.productId === p.id && new Date(s.date) >= cutoff)
        .reduce((sum, s) => sum + s.quantity, 0);
      const speed: "Fast" | "Slow" = sold >= p.reorderLevel ? "Fast" : "Slow";
      return { product: p, sold, speed };
    })
    .sort((a, b) => a.sold - b.sold);
}
