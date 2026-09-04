import type { Currency, Due, Expense, Product, Sale } from "../types";
import { formatMoney } from "./currency";
import { addDays, todayISO } from "./id";
import {
  bestMargins,
  buildRestockSuggestions,
  cashOnHand,
  dueAmountRemaining,
  isDueOverdue,
  isExpiringSoon,
  moveSpeed,
} from "./calculations";
import { EXPENSE_CATEGORIES } from "../types";
import { t, type Language } from "./i18n";

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

function upcomingSupplierDues(dues: Due[]) {
  const today = todayISO();
  return dues
    .filter((d) => d.type === "supplier" && d.status !== "settled" && (!d.dueDate || d.dueDate <= addDays(today, 7)))
    .reduce((s, d) => s + dueAmountRemaining(d), 0);
}

function restockAnswer(ctx: AskContext, lang: Language): string {
  const cash = cashOnHand(ctx.openingCashBalance, ctx.sales, ctx.expenses, ctx.dues);
  const suggestions = buildRestockSuggestions(ctx.products, ctx.sales, cash, upcomingSupplierDues(ctx.dues));
  if (suggestions.length === 0) return t(lang, "advisor.answers.restockNothing");
  return suggestions
    .map((s) => {
      const daysLeft = s.estimatedDaysRemaining !== null ? t(lang, "advisor.answers.restockDaysLeft", { days: s.estimatedDaysRemaining }) : "";
      let constraint = "";
      if (s.constrained) {
        constraint = s.upcomingSupplierDueTotal > 0
          ? t(lang, "advisor.answers.restockConstraintPayment", {
              affordable: s.affordableQty,
              ideal: s.idealSuggestedQty,
              amount: formatMoney(s.upcomingSupplierDueTotal, ctx.currency),
            })
          : t(lang, "advisor.answers.restockConstraintCash", { affordable: s.affordableQty, ideal: s.idealSuggestedQty });
      }
      return t(lang, "advisor.answers.restockLine", {
        name: s.product.name,
        stock: s.currentStock,
        unit: t(lang, `enums.unit.${s.product.unit}`),
        daysLeft,
        qty: s.affordableQty,
        cost: formatMoney(s.cost, ctx.currency),
        constraint,
      });
    })
    .join("\n");
}

function howMuchAnswer(ctx: AskContext, lang: Language): string {
  const cash = cashOnHand(ctx.openingCashBalance, ctx.sales, ctx.expenses, ctx.dues);
  const suggestions = buildRestockSuggestions(ctx.products, ctx.sales, cash, upcomingSupplierDues(ctx.dues));
  if (suggestions.length === 0) return t(lang, "advisor.answers.howMuchNothing");
  const totalCost = suggestions.reduce((s, r) => s + r.cost, 0);
  const lines = suggestions
    .map((s) =>
      t(lang, "advisor.answers.howMuchLine", {
        name: s.product.name,
        qty: s.affordableQty,
        unit: t(lang, `enums.unit.${s.product.unit}`),
        cost: formatMoney(s.cost, ctx.currency),
      })
    )
    .join("\n");
  return t(lang, "advisor.answers.howMuchHeader", { total: formatMoney(totalCost, ctx.currency), lines });
}

function canAffordAnswer(ctx: AskContext, lang: Language): string {
  const cash = cashOnHand(ctx.openingCashBalance, ctx.sales, ctx.expenses, ctx.dues);
  const upcoming = upcomingSupplierDues(ctx.dues);
  const suggestions = buildRestockSuggestions(ctx.products, ctx.sales, cash, upcoming);
  const idealTotal = suggestions.reduce((s, r) => s + r.idealSuggestedQty * r.product.cost, 0);
  if (suggestions.length === 0) return t(lang, "advisor.answers.affordNothing");
  if (idealTotal <= cash - upcoming) {
    return t(lang, "advisor.answers.affordYes", {
      total: formatMoney(idealTotal, ctx.currency),
      cash: formatMoney(cash, ctx.currency),
      upcoming: formatMoney(upcoming, ctx.currency),
    });
  }
  return t(lang, "advisor.answers.affordNo", {
    total: formatMoney(idealTotal, ctx.currency),
    upcoming: formatMoney(upcoming, ctx.currency),
    free: formatMoney(Math.max(0, cash - upcoming), ctx.currency),
  });
}

function profitAnswer(ctx: AskContext, lang: Language): string {
  const top = bestMargins(ctx.products, 5);
  if (top.length === 0) return t(lang, "advisor.answers.profitNone");
  return top
    .map((tp) => t(lang, "advisor.answers.profitLine", { name: tp.product.name, pct: tp.marginPct.toFixed(0), amount: formatMoney(tp.marginAmt, ctx.currency) }))
    .join("\n");
}

function slowAnswer(ctx: AskContext, lang: Language): string {
  const speed = moveSpeed(ctx.products, ctx.sales).filter((m) => m.speed === "Slow");
  if (speed.length === 0) return t(lang, "advisor.answers.slowNone");
  return speed.map((s) => t(lang, "advisor.answers.slowLine", { name: s.product.name, sold: s.sold, stock: s.product.stock })).join("\n");
}

function expiryAnswer(ctx: AskContext, lang: Language): string {
  const soon = ctx.products.filter((p) => !p.archived && isExpiringSoon(p, 14));
  if (soon.length === 0) return t(lang, "advisor.answers.expiryNone");
  return soon
    .map((p) => t(lang, "advisor.answers.expiryLine", { name: p.name, date: p.expiryDate ?? "", stock: p.stock, unit: t(lang, `enums.unit.${p.unit}`) }))
    .join("\n");
}

function followUpAnswer(ctx: AskContext, lang: Language): string {
  const overdue = ctx.dues.filter((d) => d.type === "customer" && isDueOverdue(d));
  if (overdue.length === 0) return t(lang, "advisor.answers.followUpNone");
  return overdue
    .map((d) => t(lang, "advisor.answers.followUpLine", { name: d.name, amount: formatMoney(dueAmountRemaining(d), ctx.currency), date: d.dueDate ?? "" }))
    .join("\n");
}

function spendingAnswer(ctx: AskContext, lang: Language): string {
  const monthStart = todayISO().slice(0, 7);
  const thisMonth = ctx.expenses.filter((e) => e.date.slice(0, 7) === monthStart);
  if (thisMonth.length === 0) return t(lang, "advisor.answers.spendingNone");
  const byCategory = new Map<string, number>();
  for (const e of thisMonth) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const labelFor = (c: string) => t(lang, `enums.expenseCategory.${c}`) || EXPENSE_CATEGORIES.find((x) => x.value === c)?.label || c;
  return sorted.map(([cat, amt]) => t(lang, "advisor.answers.spendingLine", { category: labelFor(cat), amount: formatMoney(amt, ctx.currency) })).join("\n");
}

function salesComparisonAnswer(ctx: AskContext, lang: Language): string {
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const thisTotal = ctx.sales.filter((s) => s.date.slice(0, 7) === thisMonthKey).reduce((s, x) => s + x.total, 0);
  const lastTotal = ctx.sales.filter((s) => s.date.slice(0, 7) === lastMonthKey).reduce((s, x) => s + x.total, 0);
  if (lastTotal === 0) return t(lang, "advisor.answers.salesCompareNoLast", { amount: formatMoney(thisTotal, ctx.currency) });
  const diff = ((thisTotal - lastTotal) / lastTotal) * 100;
  const direction = diff >= 0 ? t(lang, "advisor.answers.directionUp") : t(lang, "advisor.answers.directionDown");
  return t(lang, "advisor.answers.salesCompare", {
    thisAmount: formatMoney(thisTotal, ctx.currency),
    lastAmount: formatMoney(lastTotal, ctx.currency),
    pct: Math.abs(diff).toFixed(0),
    direction,
  });
}

function cashOnHandAnswer(ctx: AskContext, lang: Language): string {
  const cash = cashOnHand(ctx.openingCashBalance, ctx.sales, ctx.expenses, ctx.dues);
  return t(lang, "advisor.answers.cashOnHandLine", { amount: formatMoney(cash, ctx.currency) });
}

function owedToMeAnswer(ctx: AskContext, lang: Language): string {
  const pending = ctx.dues.filter((d) => d.type === "customer" && d.status !== "settled");
  if (pending.length === 0) return t(lang, "advisor.answers.owedToMeNone");
  return pending
    .map((d) => {
      const overdue = isDueOverdue(d) ? t(lang, "advisor.answers.overdueTag", { date: d.dueDate ?? "" }) : "";
      return t(lang, "advisor.answers.owedToMeLine", { name: d.name, amount: formatMoney(dueAmountRemaining(d), ctx.currency), overdue });
    })
    .join("\n");
}

function whatIOweAnswer(ctx: AskContext, lang: Language): string {
  const pending = ctx.dues.filter((d) => d.type === "supplier" && d.status !== "settled");
  if (pending.length === 0) return t(lang, "advisor.answers.whatIOweNone");
  return pending
    .map((d) => {
      const overdue = isDueOverdue(d) ? t(lang, "advisor.answers.overdueTag", { date: d.dueDate ?? "" }) : "";
      return t(lang, "advisor.answers.whatIOweLine", { name: d.name, amount: formatMoney(dueAmountRemaining(d), ctx.currency), overdue });
    })
    .join("\n");
}

function explainQuickCashSaleAnswer(_ctx: AskContext, lang: Language): string {
  return t(lang, "advisor.answers.explainQuickCashSale");
}

function explainCreditDuesAnswer(_ctx: AskContext, lang: Language): string {
  return t(lang, "advisor.answers.explainCreditDues");
}

function explainSettleAnswer(_ctx: AskContext, lang: Language): string {
  return t(lang, "advisor.answers.explainSettle");
}

function explainExportDemoAnswer(_ctx: AskContext, lang: Language): string {
  return t(lang, "advisor.answers.explainExportDemo");
}

const HANDLERS: Record<QuestionId, (ctx: AskContext, lang: Language) => string> = {
  restockToday: restockAnswer,
  howMuchBuy: howMuchAnswer,
  canAfford: canAffordAnswer,
  mostProfit: profitAnswer,
  sellingSlowly: slowAnswer,
  mayExpire: expiryAnswer,
  followUpCustomers: followUpAnswer,
  moneyWent: spendingAnswer,
  salesCompared: salesComparisonAnswer,
  cashOnHand: cashOnHandAnswer,
  owedToMe: owedToMeAnswer,
  whatIOwe: whatIOweAnswer,
  explainQuickCashSale: explainQuickCashSaleAnswer,
  explainCreditDues: explainCreditDuesAnswer,
  explainSettle: explainSettleAnswer,
  explainExportDemo: explainExportDemoAnswer,
};

const KEYWORDS: { keys: string[]; question: QuestionId }[] = [
  { keys: ["owe me", "owes me", "who owes", "मुझे पैसे", "मुझे कौन"], question: "owedToMe" },
  { keys: ["do i owe", "i owe", "what do i owe", "मुझे देना", "मुझे किसे"], question: "whatIOwe" },
  { keys: ["how much cash", "cash on hand", "cash balance", "कैश कितना", "कैश बैलेंस"], question: "cashOnHand" },
  { keys: ["quick cash sale", "what is quick cash", "क्विक कैश"], question: "explainQuickCashSale" },
  { keys: ["credit sale", "how do dues", "how does credit", "उधार बिक्री", "बकाया कैसे"], question: "explainCreditDues" },
  { keys: ["what does settle", "settle mean", "सेटल करने से", "सेटल का मतलब"], question: "explainSettle" },
  { keys: ["export", "csv", "demo data", "एक्सपोर्ट", "डेमो डेटा"], question: "explainExportDemo" },
  { keys: ["restock", "today", "रीस्टॉक", "स्टॉक"], question: "restockToday" },
  { keys: ["how much", "buy", "कितना", "खरीद"], question: "howMuchBuy" },
  { keys: ["afford", "अफोर्ड"], question: "canAfford" },
  { keys: ["profit", "margin", "मुनाफ़ा", "मार्जिन"], question: "mostProfit" },
  { keys: ["slow", "धीरे", "धीमा"], question: "sellingSlowly" },
  { keys: ["expire", "expiry", "waste", "एक्सपायर"], question: "mayExpire" },
  { keys: ["follow up", "customer", "collect", "overdue", "फॉलो", "ग्राहक", "बकाया"], question: "followUpCustomers" },
  { keys: ["money go", "spend", "expense", "पैसा", "खर्च"], question: "moneyWent" },
  { keys: ["compared", "last month", "vs", "तुलना", "पिछले महीने"], question: "salesCompared" },
];

const GREETING_PATTERN = /^(hi+|hello+|hey+|yo|namaste|नमस्ते|हाय|हैलो)[\s!.,]*$/i;
const ACKNOWLEDGMENT_PATTERN =
  /^(ok+(ay)?|k+|thanks?( you)?|ty|thx|cool|great|nice|good|awesome|got ?it|alright|sure|fine|bye|goodbye|see ?you|ठीक\s?है|ठीक|धन्यवाद|शुक्रिया|अच्छा|ओके)[\s!.,]*$/i;

export function answerQuestion(question: string, ctx: AskContext, lang: Language): string {
  const trimmed = question.trim();
  if (GREETING_PATTERN.test(trimmed)) return t(lang, "advisor.answers.greetingReply");
  if (ACKNOWLEDGMENT_PATTERN.test(trimmed)) return t(lang, "advisor.answers.acknowledgmentReply");

  const byId = SAMPLE_QUESTION_IDS.find((id) => t(lang, `advisor.questions.${id}`) === question || t("en", `advisor.questions.${id}`) === question);
  if (byId) return HANDLERS[byId](ctx, lang);
  const lower = question.toLowerCase();
  const match = KEYWORDS.find((k) => k.keys.some((kw) => lower.includes(kw)));
  if (match) return HANDLERS[match.question](ctx, lang);
  return t(lang, "advisor.answers.fallback");
}
