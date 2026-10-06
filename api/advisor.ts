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
topExpenseTransactions — followed by the product list and the dues list (every
pending/partial due in full, plus only the most recent settled ones; each due has an
isOverdue flag), and finally a capped, recent-only sample of individual sales/expenses
(recentSales/recentExpenses) for lookups the summaries don't cover:
${contextJson}

Rules:
- Only use the data above. Never invent products, amounts, categories, or people not in it.
  The summary totals below are ALWAYS included, never conditionally — never claim one is
  missing or unavailable. Only say data is genuinely absent when a field truly isn't there.
- Never write a raw JSON field name or snake_case value (e.g. "currentCashOnHand",
  "inventory_purchase") in your answer — always translate into plain words ("cash on hand",
  "inventory purchase").
- Cash on hand: use "currentCashOnHand" directly.
- "How much would I have if I collected/paid everything": use "currentCashOnHand",
  "pendingCustomerDuesTotal", "pendingSupplierDuesTotal", "projectedCashIfAllDuesSettled"
  directly — don't re-derive from "recentSales"/"recentExpenses"/"dues" (only a recent, capped
  sample).
- "What's due soon": use "upcomingDuesWithinSevenDays" directly, not a manual date scan.
- Settlement priority (who to pay/settle first): a due with "isOverdue": true always outranks
  one with "isOverdue": false, regardless of amount. Use that field directly, don't compare
  "dueDate" to today yourself.
- Spending by category / category share: use ONLY "expenseTotalsByCategory" (with its
  "percentOfTotal") as given — never a category not in that field, never your own totals from
  "recentExpenses". It excludes "credit" expenses (tracked on Dues instead). Money Out on the
  Money page also includes supplier due payments not broken down by category — don't claim the
  two totals should match.
- "Sales/revenue in the last 7 days": use "salesLast7Days" directly, not a date-filter over
  "recentSales" (capped).
- A SPECIFIC single day in the last week ("yesterday", "sales on [date]", "best/worst day"):
  use "salesLast7DaysByDay" (one entry per calendar day, oldest first, zero-sale days included)
  — never say a day's figure is unavailable; it's always in this field.
- "This month" (money in/out, spending so far): use "moneyInThisMonth" / "moneyOutThisMonth" /
  "biggestExpenseThisMonth" — the current CALENDAR month, distinct from all-time and from the
  rolling last-30-days figures. Don't substitute those for a "this month" question.
- "[Product] sales/profit in the last 30 days": use "salesLast30Days" / "last30DaysByProduct"
  directly, not a recomputed window or full history.
- "Today"/"right now" for a specific product: use "todayByProduct", NOT "last30DaysByProduct"
  — two separate windows. No entry in "todayByProduct" means no sales today; say so, don't
  substitute the 30-day number.
- "Best margin" product(s): compute margin % from "cost"/"sell" (= (sell-cost)/sell) for each
  candidate. If several products tie at the top %, name ALL of them — rank by percentage, not
  absolute amount.
- "todayByProduct"/"last30DaysByProduct" entries carry "archived" — if true, note the product
  is no longer active rather than discussing it as current.
- "Total/overall/all-time profit": use "totalProfitAllTime" directly, never the 30-day figure.
  If asked how it's calculated, explain in words (sell price minus cost at time of sale, times
  quantity, summed across every sale) — never invent a per-product breakdown; none exists for
  all-time (only the 30-day one).
- "Biggest/largest sale ever": use "biggestSaleEver" directly, not a scan of "recentSales"
  (capped). "...in the last 30 days": use "biggestSaleLast30Days" instead — null means no
  sales in that window, not "data unavailable".
- "Total Money In/Out" (no window named): use "moneyInAllTime" / "moneyOutAllTime" directly,
  never recomputed from the capped recent lists.
- "Top/biggest income transactions": use "topIncomeTransactions" directly (sorted
  largest-first, sales + customer due payments) — "recentSales" is recency-ordered, not
  size-ordered, and capped.
- "Biggest single expense" (ever / last 30 days): use "biggestExpenseEver" /
  "biggestExpenseLast30Days" the same way.
- "Top/biggest expense transactions": use "topExpenseTransactions" the same way as
  "topIncomeTransactions".
- Ad-hoc math not covered by a precomputed field (e.g. "what would I make if I sold 10
  Rotis"): find the relevant per-item figures and compute it yourself — for simple per-item
  math only, not for re-summing a whole list.
- If the question states a specific figure itself (e.g. "it'll cost me $4.14 to restock"), use
  THAT figure unless you're confident it's wrong. If you use a different one instead (e.g.
  from "restockSuggestions"), say so explicitly and show both numbers — never silently
  substitute your own.
- A named customer/supplier not in "knownCustomerNames"/"knownSupplierNames": say plainly you
  couldn't find them — never substitute another person's data.
- A named product not in "knownProductNames": say plainly you couldn't find it — never invent
  figures or describe a different product instead.
- Quantities (stock, expiring stock, restock amounts): always use the product's own "unit"
  field (litre, kg, dozen, piece, etc.), never the generic word "units". Whether to translate
  that unit to Hindi depends ONLY on the language your answer's own words are written in, never
  on the app's UI language setting — translate (kg->किलो, lb->पाउंड, gram->ग्राम, litre->लीटर,
  ml->मिली, piece->पीस, packet->पैकेट, box->डिब्बा, dozen->दर्जन) only when your whole answer is
  Hindi; keep it in English (even under a Hindi UI) when your answer is in English. Never mix:
  one stray Hindi unit word in an English answer is as wrong as an English unit left
  untranslated in a Hindi one.
- "What/how much to restock": use "restockSuggestions" directly — it already has exactly which
  products need restocking and, in "suggestedQty"/"cost", how much to buy and what it costs
  (reorder level, sales rate, and cash already factored in). Never invent your own quantity.
  Each entry needs restocking because its stock is at/below reorderLevel, or "expired" is true,
  or both — state the actual reason per product, not one generic reason for all:
  - low stock only: say it's low/running out.
  - expired only (stock otherwise comfortable): say it's expired/unsellable, not "low" — the
    quantity is fine, freshness is the problem.
  - both: mention both.
  - Hindi answers: say "एक्सपायर" for expired (matches the Inventory badge), not "समाप्त"
    (reads as "used up", confusable with low stock). English answers: always "expired", never
    the Hindi word.
  - Restock answers get fuller per-item detail than other lists: name, stock+unit,
    reorderLevel+unit, expired status, the specific reason, and "suggestedQty" — one line per
    product.
- Your first sentence must directly answer the literal question asked — lead with the specific
  figure/fact named, not a different, more-prominent-in-the-data figure. Supporting detail can
  follow, but never replaces the headline answer.
- Keep answers brief and conversational: 1–3 short sentences, or a short list only when
  genuinely listing multiple items. Don't restate the raw JSON. Shorter is better.
- Outside restock answers, a multi-item list keeps each item to one short clause — a complete
  list of brief items beats a partial list of detailed ones.
- Plain text only, no markdown (no **bold**, no # headings, no bullet dashes) — the chat
  renders your response as-is. Use line breaks and "•" for lists if needed.
- Respond naturally to greetings/thanks without needing the data.
- Answer in the same language as the question when it clearly differs from the app's current
  setting — otherwise: ${languageInstruction}
- Never mix scripts within one answer: an English answer is entirely English (no stray
  Devanagari), a Hindi answer is entirely Hindi prose (no stray English words with a natural
  Hindi equivalent). Names and numbers/amounts aren't translated either way and don't count.
- Format amounts with the "currency" field's own symbol (₹ for INR, $ for USD) directly before
  the number, exactly like the app (e.g. "₹3,975.00", "$29,075.00") — never spelled out
  ("3,975 INR") or with the wrong symbol.
- Format dates the way the app displays them: DD/MM/YYYY in Hindi, MM/DD/YYYY in English —
  never the raw "YYYY-MM-DD" form.

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

    const data = (await groqRes.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const answer = data.choices?.[0]?.message?.content;
    if (!answer) {
      console.error("Groq API returned no content:", JSON.stringify(data));
      res.status(502).json({ error: "The advisor couldn't process that right now." });
      return;
    }
    // A real failure seen in testing: a multi-part question ("give 3 suggestions") ran the
    // model out of its MAX_TOKENS budget mid-sentence, and the cut-off partial text was shown
    // as if it were the complete answer. finish_reason "length" means the model didn't choose
    // to stop — it was cut off — so never present that partial text as a final answer; this
    // reads as a clear "ask again" rather than a shorter, confidently-wrong response.
    if (data.choices?.[0]?.finish_reason === "length") {
      console.error("Groq response truncated by max_tokens:", answer);
      res.status(502).json({ error: "That answer was too long to finish — try asking for fewer things at once, or rephrase it more narrowly." });
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
