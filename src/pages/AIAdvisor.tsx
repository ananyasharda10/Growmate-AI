import { useMemo, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { formatMoney } from "../lib/currency";
import { answerQuestion, SAMPLE_QUESTION_IDS, type AskContext } from "../lib/askEngine";
import { buildRestockSuggestions, cashOnHand, dueAmountRemaining, isDueOverdue, moveSpeed } from "../lib/calculations";
import { addDays, todayISO } from "../lib/id";

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

  const [conversation, setConversation] = useState<{ question: string; answer: string }[]>([]);
  const [input, setInput] = useState("");

  function ask(question: string) {
    if (!question.trim()) return;
    const answer = answerQuestion(question, ctx, language);
    setConversation((c) => [...c, { question, answer }]);
    setInput("");
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
          <h2 className="text-base font-semibold text-gray-900">{t("advisor.title")}</h2>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {SAMPLE_QUESTION_IDS.map((id) => {
            const q = t(`advisor.questions.${id}`);
            return (
              <button
                key={id}
                onClick={() => ask(q)}
                className="cursor-pointer rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
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
              <p className="w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2.5 text-sm text-gray-700">
                {turn.answer}
              </p>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2"
        >
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("advisor.inputPlaceholder")} />
          <Button type="submit" icon={<Send size={16} />}>
            {t("advisor.askBtn")}
          </Button>
        </form>
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
