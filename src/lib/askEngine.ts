import type { Currency, Due, Expense, Product, Sale } from "../types";

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
    date: s.date.slice(0, 10),
    customerName: s.customerName ?? null,
  }));

  const recentExpenses = ctx.expenses.slice(0, 200).map((e) => ({
    category: e.category,
    amount: e.amount,
    paymentMethod: e.paymentMethod,
    date: e.date.slice(0, 10),
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
    currency: ctx.currency,
    openingCashBalance: ctx.openingCashBalance,
    products,
    recentSales,
    recentExpenses,
    dues,
  });
}
