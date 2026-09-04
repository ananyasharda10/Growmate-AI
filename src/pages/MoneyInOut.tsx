import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Pencil, Trash2, Wallet } from "lucide-react";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal, ConfirmDialog } from "../components/ui/Modal";
import { Input, Label, Select, Textarea } from "../components/ui/Field";
import { formatMoney } from "../lib/currency";
import { cashOnHand, cashPaidForExpenses, cashReceivedFromSales, duePaymentsTotal } from "../lib/calculations";
import { PAYMENT_METHODS, EXPENSE_CATEGORY_VALUES, type Currency, type Expense, type ExpenseCategory, type PaymentMethod, type Sale } from "../types";
import { nowISO } from "../lib/id";

export function MoneyInOut() {
  const { t } = useT();
  const allProducts = useStore((s) => s.products);
  const products = useMemo(() => allProducts.filter((p) => !p.archived), [allProducts]);
  const sales = useStore((s) => s.sales);
  const expenses = useStore((s) => s.expenses);
  const dues = useStore((s) => s.dues);
  const currency = useStore((s) => s.settings.currency);
  const openingCashBalance = useStore((s) => s.settings.openingCashBalance);
  const recordSale = useStore((s) => s.recordSale);
  const updateSale = useStore((s) => s.updateSale);
  const deleteSale = useStore((s) => s.deleteSale);
  const recordExpense = useStore((s) => s.recordExpense);
  const updateExpense = useStore((s) => s.updateExpense);
  const deleteExpense = useStore((s) => s.deleteExpense);
  const stockIn = useStore((s) => s.stockIn);

  const [tab, setTab] = useState<"sale" | "expense">("sale");

  // Sell a product
  const [saleProductId, setSaleProductId] = useState("");
  const [saleQty, setSaleQty] = useState(1);
  const [salePayment, setSalePayment] = useState<PaymentMethod>("cash");
  const [saleCustomer, setSaleCustomer] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const [saleError, setSaleError] = useState("");

  // Quick cash sale
  const [quickAmount, setQuickAmount] = useState(0);
  const [quickNote, setQuickNote] = useState("");
  const [quickPayment, setQuickPayment] = useState<PaymentMethod>("cash");

  // Expense
  const [expAmount, setExpAmount] = useState(0);
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("inventory_purchase");
  const [expPayment, setExpPayment] = useState<PaymentMethod>("cash");
  const [expSupplier, setExpSupplier] = useState("");
  const [expNote, setExpNote] = useState("");
  const [expProductId, setExpProductId] = useState("");
  const [expQty, setExpQty] = useState(1);

  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteSaleTarget, setDeleteSaleTarget] = useState<Sale | null>(null);
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<Expense | null>(null);

  const selectedProduct = products.find((p) => p.id === saleProductId);

  const moneyIn = cashReceivedFromSales(sales) + duePaymentsTotal(dues, "customer");
  const moneyOut = cashPaidForExpenses(expenses) + duePaymentsTotal(dues, "supplier");
  const cash = cashOnHand(openingCashBalance, sales, expenses, dues);

  async function submitSale() {
    setSaleError("");
    if (!selectedProduct) {
      setSaleError(t("money.chooseProductFirst"));
      return;
    }
    const result = await recordSale({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity: saleQty,
      unitPrice: selectedProduct.sell,
      total: selectedProduct.sell * saleQty,
      paymentMethod: salePayment,
      customerName: salePayment === "credit" ? saleCustomer : undefined,
      note: saleNote || undefined,
      isQuickCash: false,
    });
    if (!result.ok) {
      setSaleError(result.error ?? t("auth.genericError"));
      return;
    }
    setSaleProductId("");
    setSaleQty(1);
    setSaleNote("");
    setSaleCustomer("");
  }

  function submitQuickSale() {
    if (quickAmount <= 0) return;
    recordSale({
      productName: "Cash sale",
      quantity: 1,
      unitPrice: quickAmount,
      total: quickAmount,
      paymentMethod: quickPayment,
      note: quickNote || undefined,
      isQuickCash: true,
    });
    setQuickAmount(0);
    setQuickNote("");
  }

  function submitExpense() {
    if (expAmount <= 0) return;
    recordExpense({
      amount: expAmount,
      category: expCategory,
      paymentMethod: expPayment,
      supplierName: expPayment === "credit" ? expSupplier : undefined,
      note: expNote || undefined,
    });
    if (expCategory === "inventory_purchase" && expProductId && expQty > 0) {
      stockIn(expProductId, expQty, expNote || undefined);
    }
    setExpAmount(0);
    setExpNote("");
    setExpSupplier("");
    setExpProductId("");
    setExpQty(1);
  }

  const recentTransactions = useMemo(() => {
    const s = sales.map((sale) => ({ kind: "sale" as const, date: sale.date, sale }));
    const e = expenses.map((expense) => ({ kind: "expense" as const, date: expense.date, expense }));
    return [...s, ...e].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 25);
  }, [sales, expenses]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("money.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("money.subtitle")}</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatBlock icon={<ArrowDownCircle size={18} />} label={t("money.moneyIn")} value={formatMoney(moneyIn, currency)} tone="green" />
        <StatBlock icon={<ArrowUpCircle size={18} />} label={t("money.moneyOut")} value={formatMoney(moneyOut, currency)} tone="red" />
        <StatBlock icon={<Wallet size={18} />} label={t("money.cashOnHand")} value={formatMoney(cash, currency)} tone="brand" />
      </div>

      <div className="mb-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab("sale")}
          className={`cursor-pointer rounded-md py-2.5 text-sm font-semibold ${tab === "sale" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
        >
          {t("money.tabRecordSale")}
        </button>
        <button
          onClick={() => setTab("expense")}
          className={`cursor-pointer rounded-md py-2.5 text-sm font-semibold ${tab === "expense" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
        >
          {t("money.tabRecordExpense")}
        </button>
      </div>

      {tab === "sale" && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">{t("money.sellProductTitle")}</h2>
            <div className="space-y-4">
              <div>
                <Label>{t("money.productLabel")}</Label>
                <Select value={saleProductId} onChange={(e) => setSaleProductId(e.target.value)}>
                  <option value="">{t("money.chooseProduct")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {t("money.productOption", { name: p.name, stock: p.stock, unit: t(`enums.unit.${p.unit}`) })}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t("money.quantitySoldLabel")}</Label>
                <Input type="number" min={1} value={saleQty} onChange={(e) => setSaleQty(Number(e.target.value))} />
              </div>
              <div>
                <Label>{t("money.paymentMethodLabel")}</Label>
                <Select value={salePayment} onChange={(e) => setSalePayment(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`enums.paymentMethod.${m}`)}
                    </option>
                  ))}
                </Select>
              </div>
              {salePayment === "credit" && (
                <div>
                  <Label>{t("money.customerNameLabel")}</Label>
                  <Input value={saleCustomer} onChange={(e) => setSaleCustomer(e.target.value)} placeholder={t("money.whoOwesPlaceholder")} />
                  <p className="mt-1 text-xs text-gray-400">{t("money.addedToDuesNote")}</p>
                </div>
              )}
              <div>
                <Label>{t("money.noteOptionalLabel")}</Label>
                <Input value={saleNote} onChange={(e) => setSaleNote(e.target.value)} />
              </div>
              {selectedProduct && (
                <p className="text-sm text-gray-500">
                  {t("money.totalLabel", { amount: formatMoney(selectedProduct.sell * saleQty, currency) })}
                </p>
              )}
              {saleError && <p className="text-sm text-red-600">{saleError}</p>}
              <Button fullWidth onClick={submitSale}>
                {t("money.recordSaleBtn")}
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">{t("money.quickCashTitle")}</h2>
            <div className="space-y-4">
              <div>
                <Label>{t("money.totalAmountLabel")}</Label>
                <Input type="number" value={quickAmount} onChange={(e) => setQuickAmount(Number(e.target.value))} />
              </div>
              <div>
                <Label>{t("money.paymentMethodLabel")}</Label>
                <Select value={quickPayment} onChange={(e) => setQuickPayment(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`enums.paymentMethod.${m}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t("money.noteOptionalLabel")}</Label>
                <Input value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder={t("money.morningRushPlaceholder")} />
              </div>
              <Button fullWidth variant="secondary" onClick={submitQuickSale}>
                {t("money.addToTodaysSalesBtn")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "expense" && (
        <Card className="mb-6 p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">{t("money.recordExpenseTitle")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("money.amountLabel")}</Label>
              <Input type="number" value={expAmount} onChange={(e) => setExpAmount(Number(e.target.value))} />
            </div>
            <div>
              <Label>{t("money.categoryLabel")}</Label>
              <Select value={expCategory} onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}>
                {EXPENSE_CATEGORY_VALUES.map((c) => (
                  <option key={c} value={c}>
                    {t(`enums.expenseCategory.${c}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("money.paymentMethodLabel")}</Label>
              <Select value={expPayment} onChange={(e) => setExpPayment(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`enums.paymentMethod.${m}`)}
                  </option>
                ))}
              </Select>
            </div>
            {expPayment === "credit" && (
              <div>
                <Label>{t("money.supplierNameLabel")}</Label>
                <Input value={expSupplier} onChange={(e) => setExpSupplier(e.target.value)} placeholder={t("money.whoOwePlaceholder")} />
              </div>
            )}
            {expCategory === "inventory_purchase" && (
              <>
                <div>
                  <Label>{t("money.linkProductLabel")}</Label>
                  <Select value={expProductId} onChange={(e) => setExpProductId(e.target.value)}>
                    <option value="">{t("money.linkProductNone")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {t("money.productOption", { name: p.name, stock: p.stock, unit: t(`enums.unit.${p.unit}`) })}
                      </option>
                    ))}
                  </Select>
                </div>
                {expProductId && (
                  <div>
                    <Label>{t("money.quantityReceivedLabel")}</Label>
                    <Input type="number" min={1} value={expQty} onChange={(e) => setExpQty(Number(e.target.value))} />
                  </div>
                )}
              </>
            )}
            <div className="sm:col-span-2">
              <Label>{t("money.noteOptionalLabel")}</Label>
              <Input value={expNote} onChange={(e) => setExpNote(e.target.value)} />
            </div>
          </div>
          {expPayment === "credit" && (
            <p className="mt-2 text-xs text-gray-400">{t("money.addedToDuesSupplierNote")}</p>
          )}
          {expCategory === "inventory_purchase" && expProductId && (
            <p className="mt-2 text-xs text-gray-400">{t("money.linkProductNote")}</p>
          )}
          <Button className="mt-4" onClick={submitExpense}>
            {t("money.recordExpenseBtn")}
          </Button>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{t("money.recentTransactionsTitle")}</h2>
        {recentTransactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{t("money.noTransactions")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentTransactions.map((tx) =>
              tx.kind === "sale" ? (
                <li key={tx.sale.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{tx.sale.productName}</p>
                    <p className="text-xs text-gray-400">
                      {tx.sale.date.slice(0, 10)} · {tx.sale.quantity} × {formatMoney(tx.sale.unitPrice, currency)} · {t(`enums.paymentMethod.${tx.sale.paymentMethod}`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-brand-600">+{formatMoney(tx.sale.total, currency)}</span>
                    <RowAction onClick={() => setEditingSale(tx.sale)}>
                      <Pencil size={14} />
                    </RowAction>
                    <RowAction danger onClick={() => setDeleteSaleTarget(tx.sale)}>
                      <Trash2 size={14} />
                    </RowAction>
                  </div>
                </li>
              ) : (
                <li key={tx.expense.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t(`enums.expenseCategory.${tx.expense.category}`)}</p>
                    <p className="text-xs text-gray-400">
                      {tx.expense.date.slice(0, 10)} · {t(`enums.paymentMethod.${tx.expense.paymentMethod}`)} {tx.expense.note ? `· ${tx.expense.note}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-red-500">-{formatMoney(tx.expense.amount, currency)}</span>
                    <RowAction onClick={() => setEditingExpense(tx.expense)}>
                      <Pencil size={14} />
                    </RowAction>
                    <RowAction danger onClick={() => setDeleteExpenseTarget(tx.expense)}>
                      <Trash2 size={14} />
                    </RowAction>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </Card>

      {/* Edit sale modal */}
      <Modal open={!!editingSale} onClose={() => setEditingSale(null)} title={t("money.editSaleTitle")}>
        {editingSale && (
          <EditSaleForm
            sale={editingSale}
            currency={currency}
            onCancel={() => setEditingSale(null)}
            onSave={(patch) => {
              updateSale(editingSale.id, patch);
              setEditingSale(null);
            }}
          />
        )}
      </Modal>

      {/* Edit expense modal */}
      <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title={t("money.editExpenseTitle")}>
        {editingExpense && (
          <EditExpenseForm
            expense={editingExpense}
            onCancel={() => setEditingExpense(null)}
            onSave={(patch) => {
              updateExpense(editingExpense.id, patch);
              setEditingExpense(null);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteSaleTarget}
        title={t("money.deleteSaleTitle")}
        message={t("money.deleteSaleMsg")}
        confirmLabel={t("common.delete")}
        danger
        onConfirm={() => {
          if (deleteSaleTarget) deleteSale(deleteSaleTarget.id);
          setDeleteSaleTarget(null);
        }}
        onCancel={() => setDeleteSaleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteExpenseTarget}
        title={t("money.deleteExpenseTitle")}
        message={t("money.deleteExpenseMsg")}
        confirmLabel={t("common.delete")}
        danger
        onConfirm={() => {
          if (deleteExpenseTarget) deleteExpense(deleteExpenseTarget.id);
          setDeleteExpenseTarget(null);
        }}
        onCancel={() => setDeleteExpenseTarget(null)}
      />
    </div>
  );
}

function EditSaleForm({
  sale,
  currency,
  onSave,
  onCancel,
}: {
  sale: Sale;
  currency: Currency;
  onSave: (patch: Partial<Sale>) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [quantity, setQuantity] = useState(sale.quantity);
  const [unitPrice, setUnitPrice] = useState(sale.unitPrice);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(sale.paymentMethod);
  const [note, setNote] = useState(sale.note ?? "");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("money.quantitySoldLabel")}</Label>
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        <div>
          <Label>{t("inventory.sellPriceLabel")}</Label>
          <Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} />
        </div>
      </div>
      <div>
        <Label>{t("money.paymentMethodLabel")}</Label>
        <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`enums.paymentMethod.${m}`)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t("dues.noteLabel")}</Label>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className="text-sm text-gray-500">
        {t("money.newTotalLabel", { amount: formatMoney(quantity * unitPrice, currency) })}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" fullWidth onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          fullWidth
          onClick={() =>
            onSave({ quantity, unitPrice, total: quantity * unitPrice, paymentMethod, note: note || undefined, date: nowISO() })
          }
        >
          {t("money.saveChangesBtn")}
        </Button>
      </div>
    </div>
  );
}

function EditExpenseForm({
  expense,
  onSave,
  onCancel,
}: {
  expense: Expense;
  onSave: (patch: Partial<Expense>) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [amount, setAmount] = useState(expense.amount);
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(expense.paymentMethod);
  const [note, setNote] = useState(expense.note ?? "");

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("money.amountLabel")}</Label>
        <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      </div>
      <div>
        <Label>{t("money.categoryLabel")}</Label>
        <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
          {EXPENSE_CATEGORY_VALUES.map((c) => (
            <option key={c} value={c}>
              {t(`enums.expenseCategory.${c}`)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t("money.paymentMethodLabel")}</Label>
        <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`enums.paymentMethod.${m}`)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t("dues.noteLabel")}</Label>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" fullWidth onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button fullWidth onClick={() => onSave({ amount, category, paymentMethod, note: note || undefined, date: nowISO() })}>
          {t("money.saveChangesBtn")}
        </Button>
      </div>
    </div>
  );
}

function StatBlock({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "green" | "red" | "brand" }) {
  const toneClasses = {
    green: "bg-brand-50 text-brand-700",
    red: "bg-red-50 text-red-600",
    brand: "bg-brand-50 text-brand-700",
  }[tone];
  return (
    <Card className="p-5">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses}`}>{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </Card>
  );
}

function RowAction({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`cursor-pointer rounded-md p-1.5 hover:bg-gray-100 ${danger ? "text-red-500" : "text-gray-400"}`}>
      {children}
    </button>
  );
}
