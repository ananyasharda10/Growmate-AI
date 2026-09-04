export type Unit = "kg" | "lb" | "gram" | "litre" | "ml" | "piece" | "packet" | "box" | "dozen";

export const UNITS: Unit[] = ["kg", "lb", "gram", "litre", "ml", "piece", "packet", "box", "dozen"];

export type PaymentMethod = "cash" | "upi" | "card" | "credit";

export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "upi", "card", "credit"];

export type ExpenseCategory =
  | "inventory_purchase"
  | "packaging"
  | "transportation"
  | "rent"
  | "labor"
  | "utilities"
  | "other";

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "inventory_purchase", label: "Inventory purchase" },
  { value: "packaging", label: "Packaging" },
  { value: "transportation", label: "Transportation" },
  { value: "rent", label: "Rent" },
  { value: "labor", label: "Labor" },
  { value: "utilities", label: "Utilities" },
  { value: "other", label: "Other" },
];

export const EXPENSE_CATEGORY_VALUES: ExpenseCategory[] = EXPENSE_CATEGORIES.map((c) => c.value);

export interface Product {
  id: string;
  name: string;
  unit: Unit;
  cost: number;
  sell: number;
  stock: number;
  reorderLevel: number;
  expiryDate?: string;
  supplier?: string;
  archived: boolean;
  createdAt: string;
}

export type StockMovementType = "stock_in" | "sale" | "damaged" | "expired" | "adjustment";

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number; // signed: positive = added to stock, negative = removed
  note?: string;
  date: string;
  relatedSaleId?: string;
}

export interface Sale {
  id: string;
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  paymentMethod: PaymentMethod;
  customerName?: string; // used when paymentMethod === 'credit'
  note?: string;
  date: string;
  isQuickCash: boolean;
  linkedDueId?: string;
}

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  supplierName?: string; // used when paymentMethod === 'credit'
  note?: string;
  date: string;
  linkedDueId?: string;
}

export type DueType = "customer" | "supplier";
export type DueStatus = "pending" | "partial" | "settled";

export interface DuePayment {
  id: string;
  amount: number;
  date: string;
}

export interface Due {
  id: string;
  type: DueType;
  name: string;
  originalAmount: number;
  payments: DuePayment[];
  dueDate?: string;
  status: DueStatus;
  note?: string;
  createdAt: string;
  settledAt?: string;
  autoCreated?: boolean;
}

export type BusinessType = "food_stall" | "retail_shop" | "home_business" | "reseller" | "other";
export const BUSINESS_TYPE_VALUES: BusinessType[] = ["food_stall", "retail_shop", "home_business", "reseller", "other"];
export type Currency = "USD" | "INR";

export interface BusinessSettings {
  businessName: string;
  businessType: BusinessType;
  currency: Currency;
  defaultLowStockLevel: number;
  openingCashBalance: number;
  onboardingDismissed: boolean;
  onboardingSetupDone: boolean;
  hasSeenTour: boolean;
  currencyDefaultApplied: boolean;
}

export interface Session {
  id: string;
  email: string;
  name?: string;
}
