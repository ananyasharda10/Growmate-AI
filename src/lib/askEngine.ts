import type { Currency, Due, Expense, Product, Sale } from "../types";
import { cashOnHand, dueAmountRemaining } from "./calculations";
import { localDateOf } from "./id";

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

/**
 * Serializes the user's current business data into a compact summary for the LLM's
 * context window — this is the "retrieval" step: since the whole dataset is small and
 * structured (unlike a large document corpus), the correct approach is to hand the model
 * the relevant slice directly rather than a vector-search pipeline.
 */
export function buildAdvisorContext(ctx: AskContext): string {
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
      supplier: p.supplier ?? null,
    }));

  const recentSales = ctx.sales.slice(0, 200).map((s) => ({
    product: s.productName,
    quantity: s.quantity,
    unitPrice: s.unitPrice,
    total: s.total,
    paymentMethod: s.paymentMethod,
    date: localDateOf(s.date),
    customerName: s.customerName ?? null,
  }));

  const recentExpenses = ctx.expenses.slice(0, 200).map((e) => ({
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

  // Precomputed here, not left to the model: asking an LLM to aggregate a raw list into
  // categories is exactly the kind of task where it intermittently invents plausible-sounding
  // rows instead of literally summing what's there. Handing it the finished totals removes
  // that failure mode for category-spending questions entirely.
  const categoryTotals = new Map<string, number>();
  for (const e of ctx.expenses) categoryTotals.set(e.category, (categoryTotals.get(e.category) ?? 0) + e.amount);
  const expenseTotalsByCategory = [...categoryTotals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const knownCustomerNames = ctx.dues.filter((d) => d.type === "customer").map((d) => d.name);
  const knownSupplierNames = ctx.dues.filter((d) => d.type === "supplier").map((d) => d.name);

  // Same reasoning as expenseTotalsByCategory above: cash-on-hand and pending-dues totals
  // involve summing across the sales/expenses/dues history, which can run well beyond what's
  // included in recentSales/recentExpenses above. Precomputing them with the app's own
  // calculations (the same functions the Dashboard and Money In/Out pages use) guarantees the
  // advisor's cash answers always match the rest of the app instead of the model re-deriving
  // — and possibly mis-deriving — its own totals from a partial list.
  const pendingCustomerDuesTotal = ctx.dues
    .filter((d) => d.type === "customer" && d.status !== "settled")
    .reduce((s, d) => s + dueAmountRemaining(d), 0);
  const pendingSupplierDuesTotal = ctx.dues
    .filter((d) => d.type === "supplier" && d.status !== "settled")
    .reduce((s, d) => s + dueAmountRemaining(d), 0);
  const currentCashOnHand = cashOnHand(ctx.openingCashBalance, ctx.sales, ctx.expenses, ctx.dues);
  const projectedCashIfAllDuesSettled = currentCashOnHand + pendingCustomerDuesTotal - pendingSupplierDuesTotal;

  return JSON.stringify({
    currency: ctx.currency,
    openingCashBalance: ctx.openingCashBalance,
    products,
    recentSales,
    recentExpenses,
    expenseTotalsByCategory,
    dues,
    knownCustomerNames,
    knownSupplierNames,
    currentCashOnHand,
    pendingCustomerDuesTotal,
    pendingSupplierDuesTotal,
    projectedCashIfAllDuesSettled,
  });
}
