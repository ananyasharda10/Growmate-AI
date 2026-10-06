import { useMemo, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { formatMoney } from "../lib/currency";
import { buildAdvisorContext, SAMPLE_QUESTION_IDS, type AskContext } from "../lib/askEngine";
import { buildRestockSuggestions, cashOnHand, dueAmountRemaining, isDueOverdue, moveSpeed } from "../lib/calculations";
import { addDays, todayISO } from "../lib/id";

// Slightly longer than the server's own 20s timeout, so a normal timeout response from the
// server arrives first — this is just a backstop in case the network or function hangs
// with no response at all, so the loading indicator can never spin forever.
const CLIENT_TIMEOUT_MS = 25_000;
// A second, independent backstop — comfortably longer than CLIENT_TIMEOUT_MS plus a typical
// rate-limit countdown, but nowhere near the multi-minute hangs reported in production. Fires
// off a plain timer with no dependency on fetch/AbortController actually working, so a
// question can never be left hanging indefinitely even if that mechanism somehow doesn't.
const HARD_DEADLINE_MS = 50_000;

export function AIAdvisor() {
  const { t, language } = useT();
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const expenses = useStore((s) => s.expenses);
  const dues = useStore((s) => s.dues);
  const settings = useStore((s) => s.settings);

  const ctx: AskContext = {
    products,
    sales,
    expenses,
    dues,
    openingCashBalance: settings.openingCashBalance,
    currency: settings.currency,
  };

  const conversation = useStore((s) => s.advisorConversation);
  const addAdvisorTurn = useStore((s) => s.addAdvisorTurn);
  const resolveAdvisorTurn = useStore((s) => s.resolveAdvisorTurn);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Local/ephemeral only — never written into the persisted conversation, so it can't affect
  // the "once a turn's answer is set, it's never touched again" invariant below. Drives a
  // live ticking countdown in place of the loading dots while waiting out a rate limit,
  // instead of a static "wait about Xs" message that never visibly changes.
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  // `busy` state alone isn't enough: several rapid clicks/Enter presses can all fire before
  // React re-renders with the disabled button, each still reading the stale `busy = false`
  // from its own closure. A ref is set synchronously, so the very next call sees the lock
  // immediately regardless of render timing.
  const busyRef = useRef(false);
  // A visible, auto-clearing notice for a submit that gets rejected before it ever becomes a
  // turn (already busy, or an exact duplicate of the pending question) — a real failure seen
  // in testing was a submit disabling the input briefly with no question added, no error, and
  // no wait notice at all, which looked exactly like a no-op and invited an immediate re-submit
  // that then burned into the rate limit. Every rejected submit now says SOMETHING.
  const [blockedNotice, setBlockedNotice] = useState(false);
  const blockedNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flashBlockedNotice() {
    setBlockedNotice(true);
    if (blockedNoticeTimer.current) clearTimeout(blockedNoticeTimer.current);
    blockedNoticeTimer.current = setTimeout(() => setBlockedNotice(false), 2500);
  }

  // Returns whether the question actually got submitted — false means it was rejected (busy,
  // or an exact duplicate of the still-pending question), which the caller uses to decide
  // whether to clear its own draft text (a rejected submit shouldn't lose what was typed).
  async function ask(question: string): Promise<boolean> {
    const trimmed = question.trim();
    if (!trimmed) return false;
    if (busyRef.current) {
      flashBlockedNotice();
      return false;
    }
    // A second, independent guard against the same question being submitted twice — the
    // busyRef check above should already prevent this (a synchronous lock set before any
    // await), but a real failure was seen in testing where a lagged transcript render let an
    // identical question through a second time anyway, leaving a duplicated Q&A pair. This
    // checks the conversation state itself, which is the one place a genuine duplicate would
    // actually show up, regardless of how a second call managed to get through.
    const lastTurn = useStore.getState().advisorConversation.at(-1);
    if (lastTurn && lastTurn.answer === null && lastTurn.question === trimmed) {
      flashBlockedNotice();
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    // Once a turn's answer is set below, it is never touched again — earlier turns in the
    // conversation stay exactly as first shown, and the conversation itself is persisted so
    // navigating away and back renders the same saved answers instead of losing them.
    addAdvisorTurn(question);

    // `settled` guards against the request path and the hard deadline below both trying to
    // resolve the same turn — only the first one to finish actually writes an answer.
    let settled = false;
    function resolveOnce(patch: Parameters<typeof resolveAdvisorTurn>[0]) {
      if (settled) return;
      settled = true;
      setRetryCountdown(null);
      resolveAdvisorTurn(patch);
    }

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    async function runRequest() {
      try {
        const res = await fetch("/api/advisor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, language, context: buildAdvisorContext(ctx), today: todayISO() }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.answer) {
          if (res.status === 429 && typeof data.retryAfterSeconds === "number" && data.retryAfterSeconds > 0) {
            await runRetryCountdown(data.retryAfterSeconds);
            resolveOnce({ answer: t("advisor.retryNowReply"), error: true });
            return;
          }
          throw new Error(data?.error || "");
        }
        resolveOnce({ answer: data.answer });
      } catch (err) {
        // An abort (our own client-side timeout firing) surfaces as a raw, unfriendly browser
        // message ("The operation was aborted", "signal is aborted without reason") if treated
        // like any other error — show the same clear wording the server uses for its own
        // timeout instead. Otherwise, surface the server's own message when it gave one (e.g.
        // a specific rate-limit notice with a wait time) — it's more useful than the generic
        // fallback, which should only be shown when the failure has no better explanation.
        const isAbort = err instanceof Error && err.name === "AbortError";
        const serverMessage = err instanceof Error ? err.message : "";
        resolveOnce({
          answer: isAbort ? t("advisor.timeoutReply") : serverMessage || t("advisor.errorReply"),
          error: true,
        });
      }
    }

    // A hard backstop that doesn't depend on fetch/AbortController working correctly at all —
    // a real failure reported in testing left a question hanging for 3+ minutes in production,
    // well past both this client's 25s abort and the server's own 20s one, meaning something
    // can apparently keep the request from ever settling through the normal path. This is a
    // plain timer with no dependency on the network layer, so it fires regardless of why the
    // normal path didn't.
    const hardDeadline = new Promise<void>((resolve) => setTimeout(resolve, HARD_DEADLINE_MS));

    await Promise.race([runRequest(), hardDeadline]);
    // Best-effort: try to actually cancel a still-pending request (e.g. if the hard deadline
    // won the race), not just give up waiting on it client-side.
    controller.abort();
    resolveOnce({ answer: t("advisor.timeoutReply"), error: true });

    clearTimeout(abortTimer);
    busyRef.current = false;
    setBusy(false);
    return true;
  }

  function runRetryCountdown(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      let remaining = Math.ceil(seconds);
      setRetryCountdown(remaining);
      const interval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(interval);
          setRetryCountdown(null);
          resolve();
          return;
        }
        setRetryCountdown(remaining);
      }, 1000);
    });
  }

  const cash = cashOnHand(settings.openingCashBalance, sales, expenses, dues);
  const upcomingSupplierDues = dues
    .filter((d) => d.type === "supplier" && d.status !== "settled" && (!d.dueDate || d.dueDate <= addDays(todayISO(), 7)))
    .reduce((s, d) => s + dueAmountRemaining(d), 0);
  const restock = useMemo(() => buildRestockSuggestions(products, sales, cash, upcomingSupplierDues), [products, sales, cash, upcomingSupplierDues]);
  const overdue = dues.filter((d) => d.type === "customer" && isDueOverdue(d));
  const slow = moveSpeed(products, sales).filter((m) => m.speed === "Slow");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("advisor.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("advisor.subtitle")}</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InsightCard
          title={t("advisor.restockPriorityTitle")}
          body={
            restock.length === 0
              ? t("advisor.nothingToRestock")
              : t("advisor.restockPriorityBody", {
                  name: restock[0].product.name,
                  stock: restock[0].currentStock,
                  unit: t(`enums.unit.${restock[0].product.unit}`),
                  qty: restock[0].affordableQty,
                  cost: formatMoney(restock[0].cost, settings.currency),
                })
          }
        />
        <InsightCard
          title={t("advisor.followUpTitle")}
          body={
            overdue.length === 0
              ? t("advisor.noOverdueCustomers")
              : t("advisor.followUpBody", { count: overdue.length, s: overdue.length > 1 ? "s" : "", name: overdue[0].name })
          }
        />
        <InsightCard
          title={t("advisor.slowMoversTitle")}
          body={
            slow.length === 0
              ? t("advisor.everythingHealthyPace")
              : t("advisor.slowMoversBody", {
                  names: slow.map((s) => s.product.name).slice(0, 2).join(", "),
                  more: slow.length > 2 ? t("advisor.slowMoversMore") : "",
                })
          }
        />
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-brand-600" />
          <h2 className="text-base font-semibold text-gray-900">{t("advisor.chatSectionTitle")}</h2>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {SAMPLE_QUESTION_IDS.map((id) => {
            const q = t(`advisor.questions.${id}`);
            return (
              <button
                key={id}
                onClick={() => ask(q)}
                disabled={busy}
                className="cursor-pointer rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {q}
              </button>
            );
          })}
        </div>

        <div className="mb-4 space-y-4">
          {conversation.length === 0 && (
            <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">{t("advisor.emptyConversation")}</p>
          )}
          {conversation.map((turn, i) => (
            <div key={i} className="space-y-2">
              <p className="w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2 text-sm text-white ml-auto">{turn.question}</p>
              {turn.answer === null ? (
                retryCountdown !== null ? (
                  <p className="w-fit rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2.5 text-sm text-gray-500">
                    {t("advisor.retryCountdown", { seconds: retryCountdown })}
                  </p>
                ) : (
                  <p className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2.5 text-sm text-gray-400">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                  </p>
                )
              ) : (
                <p
                  className={`w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm ${
                    turn.error ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {turn.answer}
                </p>
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            // Cleared only once ask() confirms it actually proceeded (not inside ask() itself,
            // so a sample-question chip — which also calls ask() directly, with its own fixed
            // text — never wipes out a draft the user was mid-typing in this box) — a rejected
            // submit (already busy, or a duplicate of the pending question) leaves the typed
            // text right where it was instead of silently discarding it.
            const question = input;
            const submitted = await ask(question);
            if (submitted) setInput("");
          }}
          className="flex gap-2"
        >
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("advisor.inputPlaceholder")} disabled={busy} />
          <Button type="submit" icon={<Send size={16} />} disabled={busy}>
            {t("advisor.askBtn")}
          </Button>
        </form>
        {blockedNotice && <p className="mt-2 text-xs text-gray-500">{t("advisor.pleaseWaitNotice")}</p>}
      </Card>
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{title}</p>
      <p className="mt-2 text-sm text-gray-700">{body}</p>
    </Card>
  );
}
