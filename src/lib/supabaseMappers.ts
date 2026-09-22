import type { BusinessSettings, Due, Expense, Product, Sale, StockMovement } from "../types";

type Row = Record<string, unknown>;

export function productFromRow(r: Row): Product {
  return {
    id: r.id as string,
    name: r.name as string,
    unit: r.unit as Product["unit"],
    cost: Number(r.cost),
    sell: Number(r.sell),
    stock: Number(r.stock),
    reorderLevel: Number(r.reorder_level),
    expiryDate: (r.expiry_date as string) ?? undefined,
    supplier: (r.supplier as string) ?? undefined,
    archived: Boolean(r.archived),
    createdAt: r.created_at as string,
  };
}

export function productToRow(userId: string, p: Product): Row {
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    unit: p.unit,
    cost: p.cost,
    sell: p.sell,
    stock: p.stock,
    reorder_level: p.reorderLevel,
    expiry_date: p.expiryDate ?? null,
    supplier: p.supplier ?? null,
    archived: p.archived,
    created_at: p.createdAt,
  };
}

export function movementFromRow(r: Row): StockMovement {
  return {
    id: r.id as string,
    productId: r.product_id as string,
    type: r.type as StockMovement["type"],
    quantity: Number(r.quantity),
    note: (r.note as string) ?? undefined,
    date: r.date as string,
    relatedSaleId: (r.related_sale_id as string) ?? undefined,
  };
}

export function movementToRow(userId: string, m: StockMovement): Row {
  return {
    id: m.id,
    user_id: userId,
    product_id: m.productId,
    type: m.type,
    quantity: m.quantity,
    note: m.note ?? null,
    date: m.date,
    related_sale_id: m.relatedSaleId ?? null,
  };
}

export function saleFromRow(r: Row): Sale {
  return {
    id: r.id as string,
    productId: (r.product_id as string) ?? undefined,
    productName: r.product_name as string,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price),
    unitCost: r.unit_cost === null || r.unit_cost === undefined ? undefined : Number(r.unit_cost),
    total: Number(r.total),
    paymentMethod: r.payment_method as Sale["paymentMethod"],
    customerName: (r.customer_name as string) ?? undefined,
    note: (r.note as string) ?? undefined,
    date: r.date as string,
    isQuickCash: Boolean(r.is_quick_cash),
    linkedDueId: (r.linked_due_id as string) ?? undefined,
  };
}

export function saleToRow(userId: string, s: Sale): Row {
  return {
    id: s.id,
    user_id: userId,
    product_id: s.productId ?? null,
    product_name: s.productName,
    quantity: s.quantity,
    unit_price: s.unitPrice,
    unit_cost: s.unitCost ?? null,
    total: s.total,
    payment_method: s.paymentMethod,
    customer_name: s.customerName ?? null,
    note: s.note ?? null,
    date: s.date,
    is_quick_cash: s.isQuickCash,
    linked_due_id: s.linkedDueId ?? null,
  };
}

export function expenseFromRow(r: Row): Expense {
  return {
    id: r.id as string,
    amount: Number(r.amount),
    category: r.category as Expense["category"],
    paymentMethod: r.payment_method as Expense["paymentMethod"],
    supplierName: (r.supplier_name as string) ?? undefined,
    note: (r.note as string) ?? undefined,
    date: r.date as string,
    linkedDueId: (r.linked_due_id as string) ?? undefined,
  };
}

export function expenseToRow(userId: string, e: Expense): Row {
  return {
    id: e.id,
    user_id: userId,
    amount: e.amount,
    category: e.category,
    payment_method: e.paymentMethod,
    supplier_name: e.supplierName ?? null,
    note: e.note ?? null,
    date: e.date,
    linked_due_id: e.linkedDueId ?? null,
  };
}

export function dueFromRow(r: Row): Due {
  return {
    id: r.id as string,
    type: r.type as Due["type"],
    name: r.name as string,
    originalAmount: Number(r.original_amount),
    payments: (r.payments as Due["payments"]) ?? [],
    dueDate: (r.due_date as string) ?? undefined,
    status: r.status as Due["status"],
    note: (r.note as string) ?? undefined,
    createdAt: r.created_at as string,
    settledAt: (r.settled_at as string) ?? undefined,
    autoCreated: (r.auto_created as boolean) ?? undefined,
  };
}

export function dueToRow(userId: string, d: Due): Row {
  return {
    id: d.id,
    user_id: userId,
    type: d.type,
    name: d.name,
    original_amount: d.originalAmount,
    payments: d.payments,
    due_date: d.dueDate ?? null,
    status: d.status,
    note: d.note ?? null,
    created_at: d.createdAt,
    settled_at: d.settledAt ?? null,
    auto_created: d.autoCreated ?? false,
  };
}

export function settingsFromRow(r: Row | null, fallback: BusinessSettings): BusinessSettings {
  if (!r) return fallback;
  return { ...fallback, ...(r.data as Partial<BusinessSettings>) };
}
