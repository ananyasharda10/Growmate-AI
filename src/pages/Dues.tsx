import { useMemo, useState } from "react";
import { AlertTriangle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal, ConfirmDialog } from "../components/ui/Modal";
import { Input, Label, NumberInput, Textarea } from "../components/ui/Field";
import { formatMoney } from "../lib/currency";
import { formatDate } from "../lib/dateFormat";
import { dueAmountPaid, dueAmountRemaining, isDueOverdue } from "../lib/calculations";
import type { Due, DueType } from "../types";
import { todayISO } from "../lib/id";

export function Dues() {
  const { t, language } = useT();
  const dues = useStore((s) => s.dues);
  const currency = useStore((s) => s.settings.currency);
  const addDue = useStore((s) => s.addDue);
  const updateDue = useStore((s) => s.updateDue);
  const deleteDue = useStore((s) => s.deleteDue);
  const addDuePayment = useStore((s) => s.addDuePayment);
  const settleDue = useStore((s) => s.settleDue);
  const undoSettleDue = useStore((s) => s.undoSettleDue);

  const [tab, setTab] = useState<DueType>("customer");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const [editTarget, setEditTarget] = useState<Due | null>(null);
  const [payTarget, setPayTarget] = useState<Due | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Due | null>(null);
  const [settleTarget, setSettleTarget] = useState<Due | null>(null);

  const filtered = dues.filter((d) => d.type === tab);
  const pending = useMemo(
    () => filtered.filter((d) => d.status !== "settled").sort((a, b) => (isDueOverdue(b) ? 1 : 0) - (isDueOverdue(a) ? 1 : 0)),
    [filtered]
  );
  const settled = filtered.filter((d) => d.status === "settled");
  const total = pending.reduce((s, d) => s + dueAmountRemaining(d), 0);

  const matchingDue = useMemo(() => {
    const key = name.trim().toLowerCase();
    if (!key) return undefined;
    return filtered.find((d) => d.status !== "settled" && d.name.trim().toLowerCase() === key);
  }, [name, filtered]);

  function resetAddForm() {
    setAddOpen(false);
    setName("");
    setAmount(0);
    setDueDate("");
    setNote("");
  }

  function submitAdd() {
    if (!name.trim() || amount <= 0) return;
    addDue({ type: tab, name: name.trim(), originalAmount: amount, dueDate: dueDate || undefined, note: note || undefined });
    resetAddForm();
  }

  function submitAddToExisting() {
    if (!matchingDue || amount <= 0) return;
    updateDue(matchingDue.id, {
      originalAmount: matchingDue.originalAmount + amount,
      dueDate: dueDate || matchingDue.dueDate,
      note: note ? (matchingDue.note ? `${matchingDue.note}; ${note}` : note) : matchingDue.note,
    });
    resetAddForm();
  }

  function submitPayment() {
    if (!payTarget || payAmount <= 0) return;
    addDuePayment(payTarget.id, Math.min(payAmount, dueAmountRemaining(payTarget)));
    setPayTarget(null);
    setPayAmount(0);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("dues.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("dues.subtitle")}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab("customer")}
          className={`cursor-pointer rounded-md py-2.5 text-sm font-semibold ${tab === "customer" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
        >
          {t("dues.tabOwedToMe")}
        </button>
        <button
          onClick={() => setTab("supplier")}
          className={`cursor-pointer rounded-md py-2.5 text-sm font-semibold ${tab === "supplier" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
        >
          {t("dues.tabWhatIOwe")}
        </button>
      </div>

      <Card className="mb-6 flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {tab === "customer" ? t("dues.totalOwedToYou") : t("dues.totalYouOwe")}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatMoney(total, currency)}</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
          {t("dues.addBtn")}
        </Button>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-3 text-base font-semibold text-gray-900">{t("dues.pendingTitle")}</h2>
        {pending.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{t("dues.nothingPending")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {pending.map((d) => {
              const overdue = isDueOverdue(d);
              const remaining = dueAmountRemaining(d);
              const paid = dueAmountPaid(d);
              return (
                <li key={d.id} className={`flex items-center justify-between gap-3 py-3 ${overdue ? "bg-red-50/40 -mx-2 px-2 rounded-lg" : ""}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{d.name}</p>
                      {overdue && (
                        <Badge tone="red">
                          <AlertTriangle size={12} className="mr-1 inline" /> {t("dues.overdueBadge")}
                        </Badge>
                      )}
                      {d.status === "partial" && <Badge tone="amber">{t("dues.partialBadge")}</Badge>}
                    </div>
                    <p className="text-xs text-gray-400">
                      {d.dueDate ? t("dues.dueDateLabel", { date: formatDate(d.dueDate, language) }) : t("dues.noDueDate")} ·{" "}
                      {t("dues.paidOfLabel", { paid: formatMoney(paid, currency), total: formatMoney(d.originalAmount, currency) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{formatMoney(remaining, currency)}</span>
                    <Button variant="secondary" onClick={() => { setPayTarget(d); setPayAmount(remaining); }}>
                      {t("dues.payBtn")}
                    </Button>
                    <Button variant="outline" onClick={() => setSettleTarget(d)}>
                      {t("dues.settleBtn")}
                    </Button>
                    {paid > 0 && (
                      <RowIcon onClick={() => undoSettleDue(d.id)} title={t("dues.undoBtn")}>
                        <RotateCcw size={14} />
                      </RowIcon>
                    )}
                    <RowIcon onClick={() => setEditTarget(d)}>
                      <Pencil size={14} />
                    </RowIcon>
                    <RowIcon danger onClick={() => setDeleteTarget(d)}>
                      <Trash2 size={14} />
                    </RowIcon>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-base font-semibold text-gray-900">{t("dues.settledTitle")}</h2>
        {settled.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{t("dues.nothingSettled")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {settled.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-400 line-through">{d.name}</p>
                  <p className="text-xs text-gray-400">{d.settledAt ? formatDate(d.settledAt, language) : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-400">{formatMoney(d.originalAmount, currency)}</span>
                  <Button variant="outline" icon={<RotateCcw size={14} />} onClick={() => undoSettleDue(d.id)}>
                    {t("dues.undoBtn")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Add due */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={tab === "customer" ? t("dues.addModalTitleCustomer") : t("dues.addModalTitleSupplier")}>
        <div className="space-y-4">
          <div>
            <Label>{tab === "customer" ? t("dues.customerNameLabel") : t("dues.supplierNameLabel")}</Label>
            <Input maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {matchingDue && (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t("dues.duplicateNameNotice", { name: matchingDue.name, amount: formatMoney(dueAmountRemaining(matchingDue), currency) })}
            </p>
          )}
          <div>
            <Label>{t("dues.amountLabel")}</Label>
            <NumberInput value={amount} onChange={setAmount} />
          </div>
          <div>
            <Label>{t("dues.dueDateOptionalLabel")}</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label>{t("dues.noteOptionalLabel")}</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {matchingDue ? (
            <div className="space-y-2">
              <Button fullWidth onClick={submitAddToExisting}>
                {t("dues.addToExistingBtn", { amount: formatMoney(amount, currency) })}
              </Button>
              <Button fullWidth variant="outline" onClick={submitAdd}>
                {t("dues.createSeparateBtn")}
              </Button>
            </div>
          ) : (
            <Button fullWidth onClick={submitAdd}>
              {t("dues.addSubmitBtn")}
            </Button>
          )}
        </div>
      </Modal>

      {/* Payment */}
      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title={t("dues.paymentModalTitle", { name: payTarget?.name ?? "" })}>
        <div className="space-y-4">
          <div>
            <Label>{t("dues.amountLabel")}</Label>
            <NumberInput value={payAmount} onChange={setPayAmount} />
          </div>
          <p className="text-xs text-gray-400">
            {t("dues.willBeRecordedNote", { kind: tab === "customer" ? t("money.moneyIn") : t("money.moneyOut") })}
          </p>
          <Button fullWidth onClick={submitPayment}>
            {t("dues.recordPaymentBtn")}
          </Button>
        </div>
      </Modal>

      {/* Edit */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={t("dues.editDueTitle")}>
        {editTarget && (
          <EditDueForm
            due={editTarget}
            onCancel={() => setEditTarget(null)}
            onSave={(patch) => {
              updateDue(editTarget.id, patch);
              setEditTarget(null);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("dues.deleteConfirmTitle")}
        message={t("dues.deleteConfirmMsg", { type: tab === "customer" ? t("dues.typeCustomer") : t("dues.typeSupplier") })}
        confirmLabel={t("common.delete")}
        danger
        onConfirm={() => {
          if (deleteTarget) deleteDue(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!settleTarget}
        title={t("dues.settleConfirmTitle")}
        message={
          settleTarget
            ? t("dues.settleConfirmMsg", { amount: formatMoney(dueAmountRemaining(settleTarget), currency), name: settleTarget.name })
            : ""
        }
        confirmLabel={t("dues.settleBtn")}
        onConfirm={() => {
          if (settleTarget) settleDue(settleTarget.id);
          setSettleTarget(null);
        }}
        onCancel={() => setSettleTarget(null)}
      />
    </div>
  );
}

function EditDueForm({ due, onSave, onCancel }: { due: Due; onSave: (patch: Partial<Due>) => void; onCancel: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(due.name);
  const [amount, setAmount] = useState(due.originalAmount);
  const [dueDate, setDueDate] = useState(due.dueDate ?? "");
  const [note, setNote] = useState(due.note ?? "");

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("dues.nameLabel")}</Label>
        <Input maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>{t("dues.originalAmountLabel")}</Label>
        <NumberInput value={amount} onChange={setAmount} />
      </div>
      <div>
        <Label>{t("dues.dueDateLabel2")}</Label>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={todayISO()} />
      </div>
      <div>
        <Label>{t("dues.noteLabel")}</Label>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" fullWidth onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button fullWidth onClick={() => onSave({ name, originalAmount: amount, dueDate: dueDate || undefined, note: note || undefined })}>
          {t("dues.saveChangesBtn")}
        </Button>
      </div>
    </div>
  );
}

function RowIcon({
  children,
  onClick,
  danger,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`cursor-pointer rounded-md border border-gray-200 p-1.5 hover:bg-gray-50 ${danger ? "text-red-500" : "text-gray-500"}`}
    >
      {children}
    </button>
  );
}
