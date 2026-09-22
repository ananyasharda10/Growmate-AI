import { useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal, ConfirmDialog } from "../components/ui/Modal";
import { Input, Label, NumberInput, Select, Textarea } from "../components/ui/Field";
import { formatMoney } from "../lib/currency";
import { UNITS, type Product, type StockMovementType, type Unit } from "../types";
import {
  avgDailySalesQty,
  estimatedDaysRemaining,
  grossMarginPercent,
  isExpired,
  isExpiringSoon,
} from "../lib/calculations";
import { todayISO } from "../lib/id";

const emptyForm = {
  name: "",
  unit: "piece" as Unit,
  cost: 0,
  sell: 0,
  stock: 0,
  reorderLevel: 5,
  expiryDate: "",
  supplier: "",
};

const LARGE_QTY_THRESHOLD = 10000;

export function Inventory() {
  const { t } = useT();
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const movements = useStore((s) => s.movements);
  const addProduct = useStore((s) => s.addProduct);
  const updateProduct = useStore((s) => s.updateProduct);
  const deleteProduct = useStore((s) => s.deleteProduct);
  const stockIn = useStore((s) => s.stockIn);
  const stockAdjust = useStore((s) => s.stockAdjust);
  const currency = useStore((s) => s.settings.currency);
  const defaultLowStock = useStore((s) => s.settings.defaultLowStockLevel);

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const [stockInTarget, setStockInTarget] = useState<Product | null>(null);
  const [stockInQty, setStockInQty] = useState(1);
  const [stockInNote, setStockInNote] = useState("");

  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<StockMovementType>("damaged");
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState("");

  const [pendingLargeQty, setPendingLargeQty] = useState<{ type: "stockIn" | "adjust"; qty: number } | null>(null);

  const [historyTarget, setHistoryTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteResultMsg, setDeleteResultMsg] = useState<string | null>(null);

  const visibleProducts = useMemo(() => {
    return products
      .filter((p) => (showArchived ? p.archived : !p.archived))
      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, search, showArchived]);

  const matchingProduct = useMemo(() => {
    const key = form.name.trim().toLowerCase();
    if (!key) return undefined;
    return products.find((p) => !p.archived && p.id !== editing?.id && p.name.trim().toLowerCase() === key);
  }, [form.name, products, editing]);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, reorderLevel: defaultLowStock });
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      unit: p.unit,
      cost: p.cost,
      sell: p.sell,
      stock: p.stock,
      reorderLevel: p.reorderLevel,
      expiryDate: p.expiryDate ?? "",
      supplier: p.supplier ?? "",
    });
    setFormError("");
    setFormOpen(true);
  }

  function saveForm() {
    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      cost: Number(form.cost),
      sell: Number(form.sell),
      stock: Number(form.stock),
      reorderLevel: Number(form.reorderLevel),
      expiryDate: form.expiryDate || undefined,
      supplier: form.supplier.trim() || undefined,
    };
    if (!payload.name) {
      setFormError(t("inventory.nameRequired"));
      return;
    }
    if (payload.sell <= 0) {
      setFormError(t("inventory.invalidSellPrice"));
      return;
    }
    if (payload.cost < 0 || payload.stock < 0 || payload.reorderLevel < 0) {
      setFormError(t("inventory.invalidNegativeValue"));
      return;
    }
    setFormError("");
    if (editing) {
      updateProduct(editing.id, payload);
    } else {
      addProduct(payload);
    }
    setFormOpen(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteProduct(deleteTarget.id);
    if (result.archived) {
      setDeleteResultMsg(t("inventory.archivedMsg", { name: deleteTarget.name }));
    }
    setDeleteTarget(null);
  }

  function submitStockIn() {
    if (!stockInTarget || stockInQty <= 0) return;
    if (stockInQty > LARGE_QTY_THRESHOLD) {
      setPendingLargeQty({ type: "stockIn", qty: stockInQty });
      return;
    }
    doStockIn();
  }

  function doStockIn() {
    if (!stockInTarget) return;
    stockIn(stockInTarget.id, stockInQty, stockInNote || undefined);
    setStockInTarget(null);
    setStockInQty(1);
    setStockInNote("");
  }

  function submitAdjust() {
    if (!adjustTarget || adjustQty === 0) return;
    const delta = adjustType === "adjustment" ? adjustQty : -Math.abs(adjustQty);
    if (adjustTarget.stock + delta < 0) {
      setAdjustError(t("inventory.adjustExceedsStock", { stock: adjustTarget.stock, unit: t(`enums.unit.${adjustTarget.unit}`) }));
      return;
    }
    setAdjustError("");
    if (Math.abs(adjustQty) > LARGE_QTY_THRESHOLD) {
      setPendingLargeQty({ type: "adjust", qty: adjustQty });
      return;
    }
    doAdjust();
  }

  function doAdjust() {
    if (!adjustTarget) return;
    const delta = adjustType === "adjustment" ? adjustQty : -Math.abs(adjustQty);
    stockAdjust(adjustTarget.id, adjustType as "damaged" | "expired" | "adjustment", delta, adjustNote || undefined);
    setAdjustTarget(null);
    setAdjustQty(1);
    setAdjustNote("");
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("inventory.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("inventory.subtitle")}</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openAdd}>
          {t("inventory.addProduct")}
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder={t("inventory.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`cursor-pointer rounded-lg border px-3.5 py-2.5 text-sm font-medium ${
            showArchived ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 bg-white text-gray-600"
          }`}
        >
          {showArchived ? t("inventory.showingArchived") : t("inventory.showArchived")}
        </button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">{t("inventory.colProduct")}</th>
              <th className="px-3 py-3">{t("inventory.colCost")}</th>
              <th className="px-3 py-3">{t("inventory.colSell")}</th>
              <th className="px-3 py-3">{t("inventory.colMargin")}</th>
              <th className="px-3 py-3">{t("inventory.colStock")}</th>
              <th className="px-3 py-3">{t("inventory.colReorder")}</th>
              <th className="px-3 py-3">{t("inventory.colDaysLeft")}</th>
              <th className="px-3 py-3">{t("inventory.colSupplier")}</th>
              <th className="px-5 py-3 text-right">{t("inventory.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-gray-400">
                  {t("inventory.noProductsFound")}
                </td>
              </tr>
            )}
            {visibleProducts.map((p) => {
              const low = p.stock <= p.reorderLevel;
              const expSoon = isExpiringSoon(p);
              const expired = isExpired(p);
              const avgQty = avgDailySalesQty(p.id, sales);
              const days = estimatedDaysRemaining(p.stock, avgQty);
              const margin = grossMarginPercent(p.cost, p.sell);
              return (
                <tr key={p.id} className={`border-b border-gray-50 ${low ? "bg-red-50/40" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800">{p.name}</span>
                      <span className="text-xs text-gray-400">/{t(`enums.unit.${p.unit}`)}</span>
                      {low && <Badge tone="red">{t("inventory.badgeLow")}</Badge>}
                      {expired && <Badge tone="red">{t("inventory.badgeExpired")}</Badge>}
                      {!expired && expSoon && <Badge tone="amber">{t("inventory.badgeExpiresSoon")}</Badge>}
                      {p.archived && <Badge tone="gray">{t("inventory.badgeArchived")}</Badge>}
                    </div>
                    {p.expiryDate && <p className="mt-0.5 text-xs text-gray-400">{t("inventory.expiresLabel", { date: p.expiryDate })}</p>}
                  </td>
                  <td className="px-3 py-3 text-gray-600">{formatMoney(p.cost, currency)}</td>
                  <td className="px-3 py-3 text-gray-600">{formatMoney(p.sell, currency)}</td>
                  <td className="px-3 py-3 font-semibold text-brand-700">{margin.toFixed(0)}%</td>
                  <td className="px-3 py-3 font-semibold text-gray-800">
                    {p.stock} {t(`enums.unit.${p.unit}`)}
                  </td>
                  <td className="px-3 py-3 text-gray-500">{p.reorderLevel}</td>
                  <td className="px-3 py-3 text-gray-500">{days === null ? t("common.dash") : t("inventory.daysLeftSuffix", { days })}</td>
                  <td className="px-3 py-3 text-gray-500">{p.supplier || t("common.dash")}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <IconAction title={t("inventory.stockInTooltip")} onClick={() => setStockInTarget(p)}>
                        <ArrowDownCircle size={16} />
                      </IconAction>
                      <IconAction
                        title={t("inventory.adjustTooltip")}
                        onClick={() => {
                          setAdjustError("");
                          setAdjustTarget(p);
                        }}
                      >
                        <ArrowUpCircle size={16} />
                      </IconAction>
                      <IconAction title={t("inventory.historyTooltip")} onClick={() => setHistoryTarget(p)}>
                        <Clock size={16} />
                      </IconAction>
                      <IconAction title={t("inventory.editTooltip")} onClick={() => openEdit(p)}>
                        <Pencil size={16} />
                      </IconAction>
                      {!p.archived && (
                        <IconAction title={t("inventory.deleteTooltip")} onClick={() => setDeleteTarget(p)} danger>
                          <Trash2 size={16} />
                        </IconAction>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Add / Edit form */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? t("inventory.editModalTitle") : t("inventory.addModalTitle")}>
        <div className="space-y-4">
          <div>
            <Label>{t("inventory.productNameLabel")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          {matchingProduct && (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t("inventory.duplicateNameNotice", { name: matchingProduct.name })}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("inventory.unitLabel")}</Label>
              <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`enums.unit.${u}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("inventory.supplierOptionalLabel")}</Label>
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>
            <div>
              <Label>{t("inventory.costPriceLabel")}</Label>
              <NumberInput value={form.cost} onChange={(cost) => setForm({ ...form, cost })} />
            </div>
            <div>
              <Label>{t("inventory.sellPriceLabel")}</Label>
              <NumberInput value={form.sell} onChange={(sell) => setForm({ ...form, sell })} />
            </div>
            <div>
              <Label>{t("inventory.stockLabel")}</Label>
              <NumberInput value={form.stock} onChange={(stock) => setForm({ ...form, stock })} />
            </div>
            <div>
              <Label>{t("inventory.reorderLevelLabel")}</Label>
              <NumberInput value={form.reorderLevel} onChange={(reorderLevel) => setForm({ ...form, reorderLevel })} />
            </div>
            <div className="col-span-2">
              <Label>{t("inventory.expiryDateOptionalLabel")}</Label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} min={todayISO()} />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <Button fullWidth onClick={saveForm}>
            {matchingProduct ? t("inventory.createSeparateBtn") : editing ? t("inventory.saveChangesBtn") : t("inventory.addProductBtn")}
          </Button>
        </div>
      </Modal>

      {/* Stock in */}
      <Modal open={!!stockInTarget} onClose={() => setStockInTarget(null)} title={t("inventory.stockInTitle", { name: stockInTarget?.name ?? "" })}>
        <div className="space-y-4">
          <div>
            <Label>{t("inventory.quantityUnitLabel", { unit: stockInTarget ? t(`enums.unit.${stockInTarget.unit}`) : "" })}</Label>
            <NumberInput value={stockInQty} onChange={setStockInQty} />
          </div>
          <div>
            <Label>{t("inventory.noteOptionalLabel")}</Label>
            <Textarea rows={2} value={stockInNote} onChange={(e) => setStockInNote(e.target.value)} />
          </div>
          <Button fullWidth onClick={submitStockIn}>
            {t("inventory.addStockBtn")}
          </Button>
        </div>
      </Modal>

      {/* Adjust / damage / expire */}
      <Modal
        open={!!adjustTarget}
        onClose={() => {
          setAdjustTarget(null);
          setAdjustError("");
        }}
        title={t("inventory.adjustTitle", { name: adjustTarget?.name ?? "" })}
      >
        <div className="space-y-4">
          <div>
            <Label>{t("inventory.typeLabel")}</Label>
            <Select value={adjustType} onChange={(e) => setAdjustType(e.target.value as StockMovementType)}>
              <option value="damaged">{t("inventory.typeDamaged")}</option>
              <option value="expired">{t("inventory.typeExpired")}</option>
              <option value="adjustment">{t("inventory.typeAdjustment")}</option>
            </Select>
          </div>
          <div>
            <Label>
              {adjustType === "adjustment"
                ? t("inventory.changeQtyLabel")
                : t("inventory.quantityUnitLabel", { unit: adjustTarget ? t(`enums.unit.${adjustTarget.unit}`) : "" })}
            </Label>
            <NumberInput value={adjustQty} onChange={setAdjustQty} />
          </div>
          <div>
            <Label>{t("inventory.noteOptionalLabel")}</Label>
            <Textarea rows={2} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
          </div>
          {adjustError && <p className="text-sm text-red-600">{adjustError}</p>}
          <Button fullWidth onClick={submitAdjust}>
            {t("inventory.saveBtn")}
          </Button>
        </div>
      </Modal>

      {/* History */}
      <Modal open={!!historyTarget} onClose={() => setHistoryTarget(null)} title={t("inventory.historyTitle", { name: historyTarget?.name ?? "" })}>
        <ul className="divide-y divide-gray-100">
          {movements
            .filter((m) => m.productId === historyTarget?.id)
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-gray-700">{t(`enums.movementType.${m.type}`)}</p>
                  <p className="text-xs text-gray-400">{new Date(m.date).toLocaleDateString()} {m.note ? `· ${m.note}` : ""}</p>
                </div>
                <span className={`font-semibold ${m.quantity >= 0 ? "text-brand-600" : "text-red-500"}`}>
                  {m.quantity >= 0 ? "+" : ""}
                  {m.quantity}
                </span>
              </li>
            ))}
          {movements.filter((m) => m.productId === historyTarget?.id).length === 0 && (
            <li className="py-6 text-center text-sm text-gray-400">{t("inventory.noMovements")}</li>
          )}
        </ul>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("inventory.deleteConfirmTitle")}
        message={t("inventory.deleteConfirmMsg", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("common.delete")}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteResultMsg}
        title={t("inventory.archivedTitle")}
        message={deleteResultMsg ?? ""}
        confirmLabel={t("common.gotIt")}
        onConfirm={() => setDeleteResultMsg(null)}
        onCancel={() => setDeleteResultMsg(null)}
      />

      <ConfirmDialog
        open={!!pendingLargeQty}
        title={t("inventory.largeQtyTitle")}
        message={t("inventory.largeQtyMsg", { qty: pendingLargeQty?.qty ?? 0 })}
        confirmLabel={t("common.confirm")}
        onConfirm={() => {
          if (pendingLargeQty?.type === "stockIn") doStockIn();
          if (pendingLargeQty?.type === "adjust") doAdjust();
          setPendingLargeQty(null);
        }}
        onCancel={() => setPendingLargeQty(null)}
      />
    </div>
  );
}

function IconAction({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`cursor-pointer rounded-md border border-gray-200 p-1.5 hover:bg-gray-50 ${
        danger ? "text-red-500 hover:bg-red-50" : "text-gray-500"
      }`}
    >
      {children}
    </button>
  );
}
