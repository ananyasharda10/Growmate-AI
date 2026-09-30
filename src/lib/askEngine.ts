import type { Currency, Due, Expense, Product, Sale } from "../types";
import { buildRestockSuggestions, cashOnHand, dueAmountRemaining, isExpired, marginAmount } from "./calculations";
import { addDays, localDateOf, todayISO, daysBetween } from "./id";

export interface AskContext {
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  dues: Due[];
  openingCashBalance: number;
  currency: Currency;
}

export type QuestionId =
  | "restockToday"
  | "howMuchBuy"
  | "canAfford"
  | "mostProfit"
  | "sellingSlowly"
  | "mayExpire"
  | "followUpCustomers"
  | "moneyWent"
  | "salesCompared"
  | "cashOnHand"
  | "owedToMe"
  | "whatIOwe"
  | "explainQuickCashSale"
  | "explainCreditDues"
  | "explainSettle"
  | "explainExportDemo";

export const SAMPLE_QUESTION_IDS: QuestionId[] = [
  "restockToday",
  "howMuchBuy",
  "canAfford",
  "mostProfit",
  "sellingSlowly",
  "mayExpire",
  "followUpCustomers",
  "moneyWent",
  "salesCompared",
  "cashOnHand",
  "owedToMe",
  "whatIOwe",
  "explainQuickCashSale",
  "explainCreditDues",
  "explainSettle",
  "explainExportDemo",
];

// Recent-history arrays are capped to keep the whole context comfortably inside the
// server's safety-net truncation limit (see api/advisor.ts) — the rolling-window stats
// below cover the arithmetic questions (7-day revenue, 30-day profit, etc.) that would
// otherwise need the model to filter/sum a raw list itself, so these caps don't need to be
// large enough to hold a full month of a busy shop's history.
// Kept small: Groq's free/on-demand tier caps at 8,000 tokens per minute total (prompt +
// completion), and this context is by far the largest chunk of that budget on every
// request. The rolling-window stats below already cover the arithmetic questions these raw
// arrays used to be needed for, so they only need to be large enough for the occasional
// specific lookup, not a full history.
const MAX_RAW_SALES = 30;
const MAX_RAW_EXPENSES = 30;

function withinLastDays(dateISO: string, days: number, today: string): boolean {
  const diff = daysBetween(dateISO, today);
  return diff >= 0 && diff < days;
}

/**
 * Serializes the user's current business data into a compact summary for the LLM's
 * context window — this is the "retrieval" step: since the whole dataset is small and
 * structured (unlike a large document corpus), the correct approach is to hand the model
 * the relevant slice directly rather than a vector-search pipeline.
 */
export function buildAdvisorContext(ctx: AskContext): string {
  const today = todayISO();

  const products = ctx.products
    .filter((p) => !p.archived)
    .map((p) => ({
      name: p.name,
      unit: p.unit,
      cost: p.cost,
      sell: p.sell,
      stock: p.stock,
      reorderLevel: p.reorderLevel,
      expiryDate: p.expiryDate ?? null,
      // Precomputed rather than left for the model to compare expiryDate against today
      // itself — expired stock isn't sellable no matter how large the raw "stock" number
      // is, so this is the one signal that determines whether a product needs restocking
      // regardless of its quantity.
      expired: isExpired(p, today),
      supplier: p.supplier ?? null,
    }));

  // ---- Precomputed totals and rolling windows (never left for the model to sum itself) ----
  // Every one of these mirrors a calculation the rest of the app already does (Dashboard,
  // Money In/Out, Analytics), specifically so the advisor's numbers always match what's on
  // screen instead of the model re-deriving — and possibly mis-deriving — its own totals
  // from a raw, possibly-truncated list. This is the single most important part of the
  // context: it is placed first in the returned JSON, before the bulkier raw arrays below,
  // so that if the payload ever needs to be shortened, it's the raw history that gets cut,
  // never these numbers.
  const categoryTotals = new Map<string, number>();
  for (const e of ctx.expenses) categoryTotals.set(e.category, (categoryTotals.get(e.category) ?? 0) + e.amount);
  const totalExpenses = ctx.expenses.reduce((s, e) => s + e.amount, 0);
  const expenseTotalsByCategory = [...categoryTotals.entries()]
    .map(([category, total]) => ({ category, total, percentOfTotal: totalExpenses > 0 ? Math.round((total / totalExpenses) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total);

  const knownCustomerNames = ctx.dues.filter((d) => d.type === "customer").map((d) => d.name);
  const knownSupplierNames = ctx.dues.filter((d) => d.type === "supplier").map((d) => d.name);
  const knownProductNames = products.map((p) => p.name);

  const pendingCustomerDuesTotal = ctx.dues
    .filter((d) => d.type === "customer" && d.status !== "settled")
    .reduce((s, d) => s + dueAmountRemaining(d), 0);
  const pendingSupplierDuesTotal = ctx.dues
    .filter((d) => d.type === "supplier" && d.status !== "settled")
    .reduce((s, d) => s + dueAmountRemaining(d), 0);
  const currentCashOnHand = cashOnHand(ctx.openingCashBalance, ctx.sales, ctx.expenses, ctx.dues);
  const projectedCashIfAllDuesSettled = currentCashOnHand + pendingCustomerDuesTotal - pendingSupplierDuesTotal;

  // Same restock math the Dashboard and Advisor's own "Restock priority" card use — handed
  // over pre-computed so "what/how much should I restock" answers use the app's real
  // quantity logic (reorder-level and sales-rate based, cash-constrained) instead of the
  // model inventing its own number (a real failure seen in testing: it once suggested
  // re-buying the exact quantity that had just expired, rather than sizing to reorderLevel).
  const upcomingSupplierDueTotal = ctx.dues
    .filter((d) => d.type === "supplier" && d.status !== "settled" && (!d.dueDate || d.dueDate <= addDays(today, 7)))
    .reduce((s, d) => s + dueAmountRemaining(d), 0);
  const restockSuggestions = buildRestockSuggestions(ctx.products, ctx.sales, currentCashOnHand, upcomingSupplierDueTotal).map((r) => ({
    name: r.product.name,
    unit: r.product.unit,
    currentStock: r.currentStock,
    reorderLevel: r.product.reorderLevel,
    expired: isExpired(r.product, today),
    suggestedQty: r.affordableQty,
    cost: r.cost,
    cashConstrained: r.constrained,
  }));

  // Dues due within the next 7 days — precomputed so "what's due soon" questions don't
  // depend on the model correctly reasoning about today's date versus each due's date.
  const upcomingDues = ctx.dues
    .filter((d) => d.status !== "settled" && d.dueDate && daysBetween(today, d.dueDate) >= 0 && daysBetween(today, d.dueDate) <= 7)
    .map((d) => ({ type: d.type, name: d.name, amountRemaining: dueAmountRemaining(d), dueDate: d.dueDate }));

  // Rolling revenue windows, precomputed exactly (not left to the model to filter a raw
  // list by date) — this is what "sales in the last 7 days" style questions should use.
  function salesWindow(days: number) {
    const inWindow = ctx.sales.filter((s) => withinLastDays(localDateOf(s.date), days, today));
    return {
      days,
      transactionCount: inWindow.length,
      revenue: inWindow.reduce((s, x) => s + x.total, 0),
      dateRange: inWindow.length > 0 ? { from: [...inWindow].sort((a, b) => (a.date < b.date ? -1 : 1))[0].date.slice(0, 10), to: today } : null,
    };
  }
  const salesLast7Days = salesWindow(7);
  const salesLast30Days = salesWindow(30);

  // Per-product sales/profit, for questions like "how much profit did X make in the last 30
  // days" or "which product has the best margin today" — precomputed exactly (a known
  // failure mode: the model otherwise tends to sum a product's ENTIRE sales history instead
  // of respecting the stated window), and built separately for "today" vs "last 30 days" so
  // a "today" question can't silently get answered from the 30-day figures instead — a real
  // failure seen in testing, since only the 30-day breakdown existed before.
  const productMap = new Map(ctx.products.map((p) => [p.name, p]));
  function perProductStats(days: number) {
    const stats = new Map<string, { qty: number; revenue: number; profit: number }>();
    for (const s of ctx.sales) {
      if (!withinLastDays(localDateOf(s.date), days, today)) continue;
      const product = s.productId ? productMap.get(s.productName) : undefined;
      const unitCost = s.unitCost ?? product?.cost ?? 0;
      const entry = stats.get(s.productName) ?? { qty: 0, revenue: 0, profit: 0 };
      entry.qty += s.quantity;
      entry.revenue += s.total;
      entry.profit += (s.unitPrice - unitCost) * s.quantity;
      stats.set(s.productName, entry);
    }
    return [...stats.entries()].map(([name, stat]) => ({
      product: name,
      qtySold: stat.qty,
      revenue: stat.revenue,
      profit: Math.round(stat.profit * 100) / 100,
      // So the model can flag when a product it's discussing (from sales history) is no
      // longer an active product, instead of talking about it as if it still were — a real
      // failure seen in testing: an archived product's past profit was reported with no
      // indication it's no longer in the active inventory.
      archived: productMap.get(name)?.archived ?? false,
    }));
  }
  const todayByProduct = perProductStats(1);
  const last30DaysByProduct = perProductStats(30);

  // All-time totals the model has no other way to derive: it only ever sees a recent, capped
  // sample of sales (recentSales) plus 7/30-day rollups, so an all-time question ("total
  // profit ever", "biggest sale I've ever made") would otherwise be answered from that
  // partial sample and either invented or wrongly denied. Mirrors the Dashboard's own
  // profitTracked calculation exactly, so the two never disagree.
  const totalProfitAllTime = ctx.sales.reduce((sum, s) => {
    if (!s.productId) return sum;
    const product = ctx.products.find((p) => p.id === s.productId);
    const costAtSale = s.unitCost ?? product?.cost;
    if (costAtSale === undefined) return sum;
    return sum + marginAmount(costAtSale, s.unitPrice) * s.quantity;
  }, 0);

  const biggestSaleEver = ctx.sales.reduce<{ product: string; quantity: number; unitPrice: number; total: number; date: string } | null>(
    (best, s) => (!best || s.total > best.total ? { product: s.productName, quantity: s.quantity, unitPrice: s.unitPrice, total: s.total, date: localDateOf(s.date) } : best),
    null
  );

  const recentSales = ctx.sales.slice(0, MAX_RAW_SALES).map((s) => ({
    product: s.productName,
    quantity: s.quantity,
    unitPrice: s.unitPrice,
    total: s.total,
    paymentMethod: s.paymentMethod,
    date: localDateOf(s.date),
    customerName: s.customerName ?? null,
  }));

  const recentExpenses = ctx.expenses.slice(0, MAX_RAW_EXPENSES).map((e) => ({
    category: e.category,
    amount: e.amount,
    paymentMethod: e.paymentMethod,
    date: localDateOf(e.date),
    supplierName: e.supplierName ?? null,
  }));

  const dues = ctx.dues.map((d) => ({
    type: d.type,
    name: d.name,
    originalAmount: d.originalAmount,
    paid: d.payments.reduce((s, p) => s + p.amount, 0),
    status: d.status,
    dueDate: d.dueDate ?? null,
  }));

  return JSON.stringify({
    // Precomputed summary fields first — see the comment above for why order matters here.
    currency: ctx.currency,
    openingCashBalance: ctx.openingCashBalance,
    currentCashOnHand,
    pendingCustomerDuesTotal,
    pendingSupplierDuesTotal,
    projectedCashIfAllDuesSettled,
    upcomingDuesWithinSevenDays: upcomingDues,
    restockSuggestions,
    expenseTotalsByCategory,
    salesLast7Days,
    salesLast30Days,
    todayByProduct,
    last30DaysByProduct,
    totalProfitAllTime,
    biggestSaleEver,
    knownCustomerNames,
    knownSupplierNames,
    knownProductNames,
    products,
    dues,
    // Bulkier raw history last, and capped — only used for lookups the summaries above
    // don't cover (e.g. "when did I last sell X").
    recentSales,
    recentExpenses,
  });
}
