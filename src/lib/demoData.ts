import type { BusinessSettings, Due, Expense, Product, Sale, StockMovement } from "../types";
import { addDays, id, todayISO } from "./id";

function iso(daysAgo: number): string {
  return addDays(todayISO(), -daysAgo) + "T09:00:00.000Z";
}

export function buildDemoData(): {
  products: Product[];
  movements: StockMovement[];
  sales: Sale[];
  expenses: Expense[];
  dues: Due[];
  settings: Partial<BusinessSettings>;
} {
  const products: Product[] = [
    { id: "p-oil", name: "Cooking Oil", unit: "litre", cost: 20, sell: 30, stock: 3, reorderLevel: 7, supplier: "Metro Wholesale", archived: false, createdAt: iso(90) },
    { id: "p-rice", name: "Rice", unit: "kg", cost: 30, sell: 45, stock: 60, reorderLevel: 20, supplier: "Metro Wholesale", archived: false, createdAt: iso(90) },
    { id: "p-roti", name: "Roti", unit: "piece", cost: 3, sell: 5, stock: 40, reorderLevel: 30, archived: false, createdAt: iso(90) },
    { id: "p-milk", name: "Milk", unit: "litre", cost: 18, sell: 25, stock: 15, reorderLevel: 12, expiryDate: addDays(todayISO(), 3), supplier: "Fresh Farms Dairy", archived: false, createdAt: iso(60) },
    { id: "p-sugar", name: "Sugar", unit: "kg", cost: 22, sell: 30, stock: 5, reorderLevel: 15, supplier: "Metro Wholesale", archived: false, createdAt: iso(60) },
    { id: "p-biscuit", name: "Biscuits", unit: "packet", cost: 8, sell: 12, stock: 85, reorderLevel: 20, expiryDate: addDays(todayISO(), 45), archived: false, createdAt: iso(45) },
    { id: "p-eggs", name: "Eggs", unit: "dozen", cost: 40, sell: 55, stock: 9, reorderLevel: 10, expiryDate: addDays(todayISO(), 12), supplier: "Fresh Farms Dairy", archived: false, createdAt: iso(45) },
    { id: "p-soap", name: "Soap Bars", unit: "box", cost: 60, sell: 90, stock: 22, reorderLevel: 8, archived: false, createdAt: iso(30) },
  ];

  const movements: StockMovement[] = products.map((p) => ({
    id: id(),
    productId: p.id,
    type: "created",
    quantity: p.stock,
    date: p.createdAt,
  }));

  const sales: Sale[] = [];
  const paymentMethods = ["cash", "upi", "card", "credit"] as const;
  const salesRates: Record<string, number> = {
    "p-oil": 0.6,
    "p-rice": 1.2,
    "p-roti": 4,
    "p-milk": 1.8,
    "p-sugar": 0.8,
    "p-biscuit": 0.3,
    "p-eggs": 0.7,
    "p-soap": 0.15,
  };

  for (let day = 40; day >= 1; day--) {
    for (const p of products) {
      const rate = salesRates[p.id] ?? 0.2;
      // slow movers (soap, biscuit) skip most days
      const chance = rate >= 1 ? 0.85 : rate >= 0.5 ? 0.5 : 0.15;
      if (Math.random() > chance) continue;
      const qty = Math.max(1, Math.round(rate * (0.6 + Math.random() * 0.8)));
      const pm = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      const total = qty * p.sell;
      const saleDate = iso(day);
      const saleId = id();
      sales.push({
        id: saleId,
        productId: p.id,
        productName: p.name,
        quantity: qty,
        unitPrice: p.sell,
        unitCost: p.cost,
        total,
        paymentMethod: pm,
        customerName: pm === "credit" ? "Ramesh Kumar" : undefined,
        date: saleDate,
        isQuickCash: false,
      });
      movements.push({
        id: id(),
        productId: p.id,
        type: "sale",
        quantity: -qty,
        date: saleDate,
        relatedSaleId: saleId,
      });
    }
  }

  // A couple of quick cash sales
  sales.push(
    { id: id(), productName: "Cash sale", quantity: 1, unitPrice: 150, total: 150, paymentMethod: "cash", date: iso(2), isQuickCash: true, note: "Morning rush" },
    { id: id(), productName: "Cash sale", quantity: 1, unitPrice: 80, total: 80, paymentMethod: "cash", date: iso(6), isQuickCash: true }
  );

  // Damaged / expired movements
  movements.push({ id: id(), productId: "p-eggs", type: "damaged", quantity: -2, note: "Cracked in transit", date: iso(10) });
  movements.push({ id: id(), productId: "p-milk", type: "expired", quantity: -1, date: iso(5) });

  const expenses: Expense[] = [
    { id: id(), amount: 3200, category: "inventory_purchase", paymentMethod: "cash", date: iso(35) },
    { id: id(), amount: 450, category: "transportation", paymentMethod: "cash", date: iso(30) },
    { id: id(), amount: 1200, category: "rent", paymentMethod: "upi", date: iso(28) },
    { id: id(), amount: 600, category: "packaging", paymentMethod: "card", date: iso(20) },
    { id: id(), amount: 300, category: "utilities", paymentMethod: "cash", date: iso(15) },
    { id: id(), amount: 1500, category: "labor", paymentMethod: "upi", date: iso(10) },
    { id: id(), amount: 220, category: "other", paymentMethod: "cash", date: iso(4) },
    { id: id(), amount: 3000, category: "inventory_purchase", paymentMethod: "credit", supplierName: "Metro Wholesale", date: iso(3) },
  ];

  const dues: Due[] = [
    {
      id: id(),
      type: "customer",
      name: "Ramesh Kumar",
      originalAmount: 2500,
      payments: [],
      dueDate: addDays(todayISO(), -12),
      status: "pending",
      createdAt: iso(20),
    },
    {
      id: id(),
      type: "customer",
      name: "Priya Sharma",
      originalAmount: 1200,
      payments: [{ id: id(), amount: 500, date: addDays(todayISO(), -5) }],
      dueDate: addDays(todayISO(), 4),
      status: "partial",
      createdAt: iso(15),
    },
    {
      id: id(),
      type: "customer",
      name: "Nitin",
      originalAmount: 10000,
      payments: [{ id: id(), amount: 10000, date: iso(26) }],
      status: "settled",
      createdAt: iso(40),
      settledAt: iso(26),
    },
    {
      id: id(),
      type: "supplier",
      name: "Metro Wholesale",
      originalAmount: 3000,
      payments: [],
      dueDate: addDays(todayISO(), 3),
      status: "pending",
      createdAt: iso(3),
      note: "Sugar & oil restock",
    },
    {
      id: id(),
      type: "supplier",
      name: "Fresh Farms Dairy",
      originalAmount: 1800,
      payments: [{ id: id(), amount: 800, date: addDays(todayISO(), -2) }],
      dueDate: addDays(todayISO(), -1),
      status: "partial",
      createdAt: iso(18),
    },
  ];

  return {
    products,
    movements,
    sales,
    expenses,
    dues,
    settings: {
      businessName: "Shivani's Stall",
      businessType: "food_stall",
      currency: "INR",
      defaultLowStockLevel: 10,
      openingCashBalance: 5000,
    },
  };
}
