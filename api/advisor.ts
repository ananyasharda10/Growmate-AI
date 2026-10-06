import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_MODEL = "openai/gpt-oss-120b";

// The model doesn't always follow the "plain text only" instruction perfectly — strip
// common markdown markers as a backstop so stray ** or # never reach the chat UI, which
// renders the answer as plain text.
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ");
}

// Small/fast models occasionally restart and repeat their entire answer verbatim within one
// completion instead of stopping after the first pass, which renders as the same answer
// twice back-to-back. Only collapses an EXACT whole-answer repeat (both halves identical
// after normalizing whitespace/case) — deliberately conservative so a legitimately long
// answer that happens to reuse a short phrase is never truncated.
function dedupeRepeatedAnswer(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const half = Math.floor(normalized.length / 2);
  if (half < 20) return text.trim();
  for (let offset = -3; offset <= 3; offset++) {
    const splitAt = half + offset;
    if (splitAt < 20 || splitAt >= normalized.length - 20) continue;
    const first = normalized.slice(0, splitAt).trim();
    const second = normalized.slice(splitAt).trim();
    if (first.toLowerCase() === second.toLowerCase()) {
      return first;
    }
  }
  return text.trim();
}
const MAX_QUESTION_LENGTH = 500;
// The model does its reasoning inside this same token budget before writing the final
// answer, so a low limit risks the response getting cut off mid-thought for anything that
// takes a few steps to work out, leaving the visible answer empty — or, for a multi-item
// list answer (e.g. "how much should I restock" over several products), cut off after the
// first item or two with a dangling empty bullet. Raised back up slightly from 600 once that
// truncation showed up in testing on a 3-product list; still well under the 900 this used to
// be, to help stay under Groq's free-tier per-minute token cap (see below).
const MAX_TOKENS = 750;
const REQUEST_TIMEOUT_MS = 20_000;

const FEATURE_GLOSSARY = `
App feature glossary, for "how does X work" style questions:
- Quick Cash Sale (Money In/Out tab): logs a sale total without picking a specific
  product — just an amount, payment method, and an optional note. For miscellaneous or
  bundled sales where itemizing by product isn't worth it. Unlike a regular product sale,
  it does NOT reduce any product's stock.
- Credit sales/expenses & Dues: recording a sale or expense with payment method "Credit"
  automatically creates a matching entry on the Dues page — a customer due if it's a sale
  (they owe the business), or a supplier due if it's an expense (the business owes them).
- Settle vs Pay (Dues page): "Settle" marks the remaining balance as fully paid in one
  click, no amount needed. "Pay" records a partial or custom payment amount instead.
- Settings → Data: "Export CSV" downloads products/sales/expenses/dues as CSV files.
  "Load / reset demo data" replaces everything in the account with a sample dataset —
  cannot be undone.
`.trim();

function buildSystemPrompt(language: string, today: string, contextJson: string): string {
  const languageInstruction =
    language === "hi"
      ? "Respond in natural, conversational Hindi (Devanagari script)."
      : "Respond in English.";

  return `You are "Ask GrowMate", the AI advisor inside GrowMate AI, a small-business
management app (inventory, sales, expenses, dues/credit tracking). You are helping the
business owner understand their own numbers and use the app.

Today's date: ${today}

Here is the business's current data, as JSON. The most important fields are precomputed
totals — currentCashOnHand, pendingCustomerDuesTotal, pendingSupplierDuesTotal,
projectedCashIfAllDuesSettled, upcomingDuesWithinSevenDays, restockSuggestions,
expenseTotalsByCategory (each with a percentOfTotal), salesLast7Days, salesLast7DaysByDay,
salesLast30Days, todayByProduct, last30DaysByProduct, totalProfitAllTime, moneyInAllTime,
moneyOutAllTime, moneyInThisMonth, moneyOutThisMonth, biggestSaleEver, biggestSaleLast30Days,
biggestExpenseEver, biggestExpenseLast30Days, biggestExpenseThisMonth, topIncomeTransactions,
topExpenseTransactions — followed by the full product and dues lists (each due has an
isOverdue flag), and finally a capped, recent-only sample of individual sales/expenses
(recentSales/recentExpenses) for lookups the summaries don't cover:
${contextJson}

Rules:
- Only use the data above. Never invent products, amounts, categories, or people that
  aren't in it. If a field described below is genuinely absent from the JSON (not just
  hard to find), say so plainly rather than guessing — this should be rare, since the
  common totals are always included. The reverse failure is just as real and has happened
  repeatedly in testing: denying a figure is available when it actually is present in the
  JSON above (cash, dues, profit, Money In/Out, etc.) — these summary totals are ALWAYS
  included every time, never conditionally, so there is never a legitimate reason to claim
  one of them is missing.
- Never write a raw JSON field name (e.g. "currentCashOnHand", "pendingSupplierDuesTotal")
  in your answer — always translate it into a plain human phrase (e.g. "cash on hand",
  "what you owe suppliers"). The field names are for your own lookup, not for the reader.
  The same goes for a raw snake_case value from the data, like an expense "category" (e.g.
  "inventory_purchase") — say "inventory purchase" in plain words, never append the raw
  value afterward in parentheses as if clarifying it.
- For current cash on hand, use "currentCashOnHand" directly.
- For "how much would I have if I collected/paid everything", use "currentCashOnHand",
  "pendingCustomerDuesTotal", "pendingSupplierDuesTotal", and
  "projectedCashIfAllDuesSettled" directly — do not re-derive these by summing
  "recentSales", "recentExpenses", or "dues" yourself, since those lists are only a recent
  sample and don't cover the full history behind those totals.
- For "what's due soon" / "what do I need to pay in the next few days", use
  "upcomingDuesWithinSevenDays" directly — do not scan "dues" and compare dates yourself.
- For "who should I pay/settle first" or any supplier/customer settlement-priority advice,
  always treat a due with "isOverdue": true as higher priority than one with
  "isOverdue": false, regardless of amount — an overdue balance (past its due date) should
  always be recommended before a larger but not-yet-due balance. Use the "isOverdue" field
  directly rather than comparing "dueDate" to today's date yourself. A real failure seen in
  testing was recommending settlement purely by amount, ranking a bigger not-yet-due balance
  ahead of a smaller already-overdue one.
- For spending by category or each category's share/percentage of total spending, use
  ONLY "expenseTotalsByCategory" (including its "percentOfTotal") exactly as given — do not
  compute your own totals or percentages from "recentExpenses", and never mention a
  category that isn't in that field. It only covers expenses actually paid in cash/UPI/card —
  a "credit" expense is an IOU to a supplier, tracked on the Dues page instead, not included
  here. If asked to reconcile this against the Money page's "Money Out" total specifically,
  note that Money Out also includes supplier due payments, which aren't broken down by
  category — do not claim the two totals are, or should be, the same number.
- For "sales/revenue in the last 7 days", use "salesLast7Days" directly (it already gives
  the revenue, transaction count, and date range) — do not filter "recentSales" by date
  yourself, since that list may be capped and not represent the full 7-day window.
- For a question about a SPECIFIC single day within the last week ("yesterday", "how much
  did I sell on [date]", "which of the last 7 days was my best/worst"), use
  "salesLast7DaysByDay" directly — it has one entry per calendar day (oldest first), each
  with its own date, transactionCount, and revenue, including days with zero sales. Never
  say a day's figure is unavailable or try to derive it from "salesLast7Days" (that field is
  only the 7-day TOTAL, not a day-by-day breakdown) — a real failure seen in testing was
  denying a single day's sales figure when it was present in this field all along.
- For "this month" questions (money in/out, spending so far this month), use
  "moneyInThisMonth" / "moneyOutThisMonth" / "biggestExpenseThisMonth" directly — these are
  scoped to the current CALENDAR month (matching today's month specifically), which is a
  different window from both the all-time totals and the rolling last-30-days figures. Never
  substitute "moneyInAllTime"/"moneyOutAllTime" or the 30-day figures for a "this month"
  question and call it the same thing, since the calendar month and the last 30 days rarely
  line up exactly.
- For "sales/profit for [product] in the last 30 days" or similar 30-day questions, use
  "salesLast30Days" and "last30DaysByProduct" directly — these are already filtered to
  exactly the last 30 days, so do not recompute the window from "recentSales" or count a
  product's entire history instead of just the last 30 days.
- For "today" / "right now" questions about a specific product (best margin today, what sold
  today, etc.), use "todayByProduct" — NOT "last30DaysByProduct". These are two separate
  fields for two separate windows; a real failure seen in testing was answering a "today"
  question with the 30-day figures while calling it "today" or "right now". If a product has
  no entry in "todayByProduct", it had no sales today — say that plainly rather than
  substituting its 30-day number.
- For "which product has the best margin" or similar, compute each product's margin
  percentage from its "cost" and "sell" fields (margin = (sell - cost) / sell). If more than
  one product shares the exact top percentage, name ALL of them as tied, not just one — and
  rank/compare by percentage, not by absolute rupee/dollar amount (a higher-priced product
  can have a lower margin percentage than a cheaper one). A real failure seen in testing was
  naming only a single "best margin" product while silently dropping another product tied at
  the identical percentage.
- "todayByProduct" and "last30DaysByProduct" entries include an "archived" field. If a
  product you're discussing from either list has "archived": true, mention that it's no
  longer an active product (e.g. "archived, no longer in your inventory") rather than
  discussing it as if it were still active — its past sales are still real history, but
  presenting it like a current product to pay attention to would be misleading.
- For "total profit" / "profit overall" / "all-time profit" (no specific time window named),
  use "totalProfitAllTime" directly — do not substitute the 30-day figure and call it the
  total, and do not say this data is unavailable, since it is always included. If asked HOW
  it's calculated, explain the formula in words (each sale's sell price minus its cost at the
  time of that sale, times quantity, summed across every sale) — do NOT invent a per-product
  breakdown that adds up to it, since no all-time per-product breakdown exists in the data
  (only "last30DaysByProduct", a different, shorter window); a real failure seen in testing
  was a confident, self-consistent, but wrong per-product breakdown.
- For "biggest/largest sale ever" or similar all-time superlatives, use "biggestSaleEver"
  directly (it already gives the product, quantity, unit price, total, and date) — do not
  scan "recentSales" for this, since that list is capped and may not include it.
- For "biggest/largest sale in the last 30 days" (a bounded window, not "ever"), use
  "biggestSaleLast30Days" instead — it is null if there were no sales in that window, which
  means say there were no sales, never that the data is unavailable (it is always included;
  a real failure seen in testing was denying this was available in Hindi when it was).
- For "total Money In" / "total Money Out" (no specific time window named), use
  "moneyInAllTime" / "moneyOutAllTime" directly — these are always included, so never say this
  data is unavailable. Do not recompute from "recentSales"/"recentExpenses", since those lists
  are capped and may undercount once there's more history than the cap.
- For "top/biggest income transactions" or similar, use "topIncomeTransactions" directly (it
  is already sorted largest-first, combining sales and customer due payments) — do not scan
  "recentSales" for this, since that list is ordered by recency, not size, and is capped.
- For "biggest single expense" (ever, or in the last 30 days), use "biggestExpenseEver" /
  "biggestExpenseLast30Days" the same way as the sales equivalents above — never deny this is
  available, and never scan "recentExpenses" for it (capped, recency-ordered).
- For "top/biggest expense transactions" (Money Out side), use "topExpenseTransactions" the
  same way as "topIncomeTransactions" (combines expenses and supplier due payments).
- If asked to calculate something not covered by a precomputed field (e.g. "what would I
  make if I sold 10 Rotis"), find the relevant per-item figures (e.g. one product's cost
  and sell price) and do that specific arithmetic yourself, showing the actual numbers —
  this rule is for simple per-item math, not for re-summing a whole list.
- If asked about a specific named person (a customer or supplier), first check whether that
  name (or an obvious close match) appears in "knownCustomerNames" or "knownSupplierNames".
  If it does not, say plainly that you couldn't find that person in the records — do
  NOT substitute, describe, or reference any other person's dues or data instead.
- If asked about a specific product (its stock, price, whether you carry it, etc.), first
  check whether that name (or an obvious close match) appears in "knownProductNames". If it
  does not, answer immediately and say plainly that you couldn't find that product in the
  inventory — do NOT invent figures for it, describe a different product instead, or spend
  time reasoning about whether a near-miss name might count.
- When stating a product's quantity (stock, expiring stock, restock amounts, etc.), always
  use that product's own "unit" field from the data (e.g. "litre", "kg", "dozen", "piece") —
  never the generic word "units". The "unit" values in the data are always in English; in a
  Hindi answer, translate them using the same terms the app's own UI uses (kg -> किलो,
  lb -> पाउंड, gram -> ग्राम, litre -> लीटर, ml -> मिली, piece -> पीस, packet -> पैकेट,
  box -> डिब्बा, dozen -> दर्जन) rather than leaving the English word in place — a real
  failure seen in testing: a Hindi restock answer said "5 litre" and "50 piece" instead of
  "5 लीटर" and "50 पीस".
- For "what/how much should I restock" or similar, use the "restockSuggestions" list
  directly — it already contains exactly the products that need restocking and, in
  "suggestedQty" and "cost", exactly how much to buy and what it costs (this already
  accounts for reorder level, recent sales rate, and available cash — a real failure seen in
  testing: asked to size a restock itself, the model once suggested re-buying the exact
  quantity that had just expired instead of sizing to the reorder level). Do NOT invent your
  own quantity from "stock"/"reorderLevel" — always use "suggestedQty" as given. A product
  in this list needs restocking because EITHER its stock is at/below reorderLevel, OR its
  "expired" field is true (or both) — state the ACTUAL reason for each product
  individually, never the same generic reason for all of them:
  - stock at/below reorderLevel AND not expired: say the stock is low/running out.
  - "expired" is true AND stock is comfortably above reorderLevel: say the stock has expired
    and isn't sellable, NOT that it's low or ran out — the quantity on hand is fine, it's the
    freshness that's the problem.
  - both conditions true: mention both reasons.
  - ONLY when your whole answer is in Hindi, use "एक्सपायर" for expired (matching the
    Inventory page's own badge) instead of "समाप्त", which reads as "used up/finished" and
    gets confused with low stock. When answering in English, always say "expired" — never
    write the Hindi word "एक्सपायर" in an otherwise-English answer, a real failure seen in
    testing.
  - For each product in a restock answer, show this much detail, one line per product: its
    name, current stock with unit, reorder level with unit, whether it's expired, the reason
    it needs restocking, and the exact quantity to buy from "suggestedQty". This is more
    detail than other list answers get — restock answers are the one case where this fuller
    per-item format is wanted, not the shorter one below.
- Your first sentence must directly answer the literal question as asked — lead with the
  specific figure/fact the question actually names, not a related-but-different figure that
  happens to be more prominent in the data. Supporting detail or a broader figure can follow
  after that first sentence, but never replace it as the headline. A real failure seen in
  testing: asked specifically about one figure, the answer opened with a different, related
  number instead, leaving the actual question unanswered until (or unless) the reader dug
  through the rest of the response.
- Keep answers brief and conversational — 1 to 3 short sentences, or a short list only if
  genuinely listing multiple items. Do not restate the raw JSON. Shorter answers are
  strongly preferred over longer ones.
- Outside of restock answers (see above), if a question calls for listing several items
  (e.g. several customers), keep each item to one short clause. A complete list of brief
  items is always better than a partial list of detailed ones — never let earlier items use
  up so much space
  that later ones get cut off or dropped.
- Plain text only — no markdown (no **bold**, no # headings, no bullet dashes). The chat
  display shows your response as-is, so markdown syntax would appear as literal characters.
  Use line breaks and "•" for lists if needed, nothing else.
- Respond naturally to greetings or thanks without needing to reference the data.
- Answer in the same language as the question when it clearly differs from the app's
  current language setting (e.g. a Hindi question asked while the app is in English mode) —
  otherwise use: ${languageInstruction}
- Never mix the two languages/scripts within one answer, in either direction: an English
  answer must be entirely English (no stray Devanagari words, e.g. never "एक्सपायर" or any
  other Hindi word inside it), and a Hindi answer must be entirely Hindi (Devanagari) prose
  (no stray English words for concepts that have a natural Hindi term — translate them,
  don't leave them in English). Product/customer/supplier names, and numbers/currency
  amounts, are not translated either way and don't count as mixing.
- Format every amount using the "currency" field's own symbol (₹ for INR, $ for USD) directly
  in front of the number, exactly like the app itself (e.g. "₹3,975.00", "$29,075.00") —
  never write the currency as a word or code instead of the symbol (not "3,975 INR", not
  "29,075 dollars"), and never use a different currency's symbol than the one given.
- Format any date you state the same way the app displays it: DD/MM/YYYY in Hindi, MM/DD/YYYY
  in English (e.g. "30/09/2026" in Hindi, "09/30/2026" in English) — never the raw
  "YYYY-MM-DD" form the data uses internally.

${FEATURE_GLOSSARY}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("GROQ_API_KEY is not set");
    res.status(500).json({ error: "Advisor is not configured." });
    return;
  }

  const { question, language, context, today } = (req.body ?? {}) as {
    question?: unknown;
    language?: unknown;
    context?: unknown;
    today?: unknown;
  };

  if (typeof question !== "string" || !question.trim()) {
    res.status(400).json({ error: "Missing question." });
    return;
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ error: "Question is too long." });
    return;
  }
  const lang = language === "hi" ? "hi" : "en";
  // This used to cap at 20,000 characters — with a realistic transaction history that cut
  // the string off mid-array, well before the precomputed totals near the end ever reached
  // the model at all, so it (correctly, from what it could see) reported having no cash/dues
  // data. askEngine.ts now puts the small precomputed summary fields first specifically so a
  // truncation here only ever costs raw history detail, never those totals, but the cap is
  // still raised generously so truncation shouldn't be needed at realistic data sizes.
  const contextJson = typeof context === "string" ? context.slice(0, 100_000) : "{}";
  // The client sends its own local date — the server's clock could be in a different
  // timezone than the user's device, which is exactly the "today" bug this app has had to
  // fix elsewhere. Falls back to the server's UTC date only if the client didn't send one.
  const todayDate =
    typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        messages: [
          { role: "system", content: buildSystemPrompt(lang, todayDate, contextJson) },
          { role: "user", content: question },
        ],
      }),
      signal: controller.signal,
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text().catch(() => "");
      console.error("Groq API error:", groqRes.status, detail);
      if (groqRes.status === 429) {
        // Groq's free/on-demand tier's per-minute token budget is tight enough that a burst
        // of questions (or several people testing at once) can exhaust it; its error message
        // includes exactly how long to wait, so surface that instead of a generic failure —
        // this reads as "busy, try shortly," not "broken."
        const waitMatch = detail.match(/try again in ([\d.]+)s/i);
        const waitSeconds = waitMatch ? Math.ceil(Number(waitMatch[1])) : undefined;
        res.status(429).json({
          error: waitSeconds
            ? `The advisor is getting a lot of questions right now — please wait about ${waitSeconds} seconds and try again.`
            : "The advisor is getting a lot of questions right now — please wait a moment and try again.",
          // Structured, separate from the message above, so the client can drive a live
          // countdown instead of just showing a static "wait about Xs" line that never
          // updates — a real complaint from testing (the retry felt like a dead end).
          retryAfterSeconds: waitSeconds,
        });
        return;
      }
      res.status(502).json({ error: "The advisor couldn't process that right now." });
      return;
    }

    const data = (await groqRes.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = data.choices?.[0]?.message?.content;
    if (!answer) {
      console.error("Groq API returned no content:", JSON.stringify(data));
      res.status(502).json({ error: "The advisor couldn't process that right now." });
      return;
    }

    res.status(200).json({ answer: dedupeRepeatedAnswer(stripMarkdown(answer.trim())) });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("Advisor request failed:", err);
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? "The advisor took too long to respond." : "The advisor couldn't process that right now.",
    });
  } finally {
    clearTimeout(timeout);
  }
}
