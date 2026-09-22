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
const MAX_QUESTION_LENGTH = 500;
const MAX_TOKENS = 400;
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

function buildSystemPrompt(language: string, contextJson: string): string {
  const languageInstruction =
    language === "hi"
      ? "Respond in natural, conversational Hindi (Devanagari script)."
      : "Respond in English.";

  return `You are "Ask GrowMate", the AI advisor inside GrowMate AI, a small-business
management app (inventory, sales, expenses, dues/credit tracking). You are helping the
business owner understand their own numbers and use the app.

Today's date: ${new Date().toISOString().slice(0, 10)}

Here is the business's current data, as JSON (products, recent sales, recent expenses,
dues, opening cash balance, currency):
${contextJson}

Rules:
- Only use the data above. Never invent products, amounts, or people that aren't in it.
- If asked to calculate something (e.g. "what would I make if I sold 10 Rotis"), find the
  relevant figures in the data and do the arithmetic yourself, showing the actual numbers.
- If the data needed to answer isn't present, say so plainly rather than guessing.
- Keep answers short and conversational — a few sentences, or a short list if genuinely
  listing multiple items. Do not restate the raw JSON.
- Plain text only — no markdown (no **bold**, no # headings, no bullet dashes). The chat
  display shows your response as-is, so markdown syntax would appear as literal characters.
  Use line breaks and "•" for lists if needed, nothing else.
- Respond naturally to greetings or thanks without needing to reference the data.
- ${languageInstruction}

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

  const { question, language, context } = (req.body ?? {}) as {
    question?: unknown;
    language?: unknown;
    context?: unknown;
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
  const contextJson = typeof context === "string" ? context.slice(0, 20_000) : "{}";

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
          { role: "system", content: buildSystemPrompt(lang, contextJson) },
          { role: "user", content: question },
        ],
      }),
      signal: controller.signal,
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text().catch(() => "");
      console.error("Groq API error:", groqRes.status, detail);
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

    res.status(200).json({ answer: stripMarkdown(answer.trim()) });
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
