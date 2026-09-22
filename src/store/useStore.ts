import { create } from "zustand";
import { persist } from "zustand/middleware";
import { t, type Language } from "../lib/i18n";
import type {
  BusinessSettings,
  Due,
  DueType,
  Expense,
  ExpenseCategory,
  PaymentMethod,
  Product,
  Sale,
  Session,
  StockMovement,
  StockMovementType,
} from "../types";
import { id, nowISO, todayISO } from "../lib/id";
import { buildDemoData } from "../lib/demoData";
import { supabase } from "../lib/supabaseClient";
import {
  dueFromRow,
  dueToRow,
  expenseFromRow,
  expenseToRow,
  movementFromRow,
  movementToRow,
  productFromRow,
  productToRow,
  saleFromRow,
  saleToRow,
  settingsFromRow,
} from "../lib/supabaseMappers";

const defaultSettings: BusinessSettings = {
  businessName: "My Business",
  businessType: "food_stall",
  currency: "INR",
  defaultLowStockLevel: 10,
  openingCashBalance: 0,
  onboardingDismissed: false,
  onboardingSetupDone: false,
  hasSeenTour: false,
  currencyDefaultApplied: false,
};

const DEMO_SESSION: Session = { id: "demo", email: "demo@growmate.ai", name: "Demo User" };

interface StoreState {
  session: Session | null;
  settings: BusinessSettings;
  products: Product[];
  movements: StockMovement[];
  sales: Sale[];
  expenses: Expense[];
  dues: Due[];
  isDemo: boolean;
  hydrated: boolean;
  syncError: string | null;
  language: Language;
  setLanguage: (language: Language) => void;

  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  hydrate: (userId: string) => Promise<void>;
  setSessionFromSupabase: (userId: string, email: string, name?: string) => void;
  dismissSyncError: () => void;

  updateSettings: (partial: Partial<BusinessSettings>) => void;

  addProduct: (input: Omit<Product, "id" | "createdAt" | "archived">) => void;
  updateProduct: (productId: string, partial: Partial<Product>) => void;
  archiveProduct: (productId: string) => void;
  deleteProduct: (productId: string) => { ok: boolean; archived?: boolean };

  stockIn: (productId: string, quantity: number, note?: string) => void;
  stockAdjust: (productId: string, type: Extract<StockMovementType, "damaged" | "expired" | "adjustment">, delta: number, note?: string) => void;

  recordSale: (input: {
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
    paymentMethod: PaymentMethod;
    customerName?: string;
    note?: string;
    date?: string;
    isQuickCash?: boolean;
  }) => { ok: boolean; error?: string };
  updateSale: (saleId: string, input: Partial<Sale>) => { ok: boolean; error?: string };
  deleteSale: (saleId: string) => void;

  recordExpense: (input: {
    amount: number;
    category: ExpenseCategory;
    paymentMethod: PaymentMethod;
    supplierName?: string;
    note?: string;
    date?: string;
  }) => void;
  updateExpense: (expenseId: string, input: Partial<Expense>) => void;
  deleteExpense: (expenseId: string) => void;

  addDue: (input: { type: DueType; name: string; originalAmount: number; dueDate?: string; note?: string }) => void;
  updateDue: (dueId: string, partial: Partial<Due>) => void;
  deleteDue: (dueId: string) => void;
  addDuePayment: (dueId: string, amount: number, date?: string) => void;
  settleDue: (dueId: string) => void;
  undoSettleDue: (dueId: string) => void;

  loadDemoData: () => void;
  resetDemoData: () => void;
  clearAllData: () => void;
}

function recomputeDueStatus(due: Due): Due {
  const paid = due.payments.reduce((s, p) => s + p.amount, 0);
  if (paid >= due.originalAmount) {
    return { ...due, status: "settled", settledAt: due.payments.at(-1)?.date ?? nowISO() };
  }
  if (paid > 0) {
    return { ...due, status: "partial", settledAt: undefined };
  }
  return { ...due, status: "pending", settledAt: undefined };
}

function describeSupabaseError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string };
    return [e.code, e.message ?? e.details].filter(Boolean).join(": ") || JSON.stringify(error);
  }
  return String(error);
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" ? (error as { code?: string }).code : undefined;
}

async function fetchAllTables(uid: string) {
  const [settingsRes, productsRes, movementsRes, salesRes, expensesRes, duesRes] = await Promise.all([
    supabase.from("business_settings").select("*").eq("user_id", uid).maybeSingle(),
    supabase.from("products").select("*").eq("user_id", uid).order("created_at"),
    supabase.from("stock_movements").select("*").eq("user_id", uid).order("date"),
    supabase.from("sales").select("*").eq("user_id", uid).order("date", { ascending: false }),
    supabase.from("expenses").select("*").eq("user_id", uid).order("date", { ascending: false }),
    supabase.from("dues").select("*").eq("user_id", uid).order("created_at"),
  ]);
  return { settingsRes, productsRes, movementsRes, salesRes, expensesRes, duesRes };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
  // Fires a set of background Supabase writes for the mutation that already happened
  // locally. If any of them fail, the local state is rolled back to `prev` and a
  // dismissible error banner is surfaced via `syncError`.
  function fireSync(writes: PromiseLike<{ error: unknown }>[], prev: Partial<StoreState>) {
    Promise.all(writes).then((results) => {
      const failedResults = results.filter((r) => r.error);
      if (failedResults.length > 0) {
        console.error("Supabase write failed:", failedResults.map((r) => r.error));
        const detail = failedResults.map((r) => describeSupabaseError(r.error)).join(" | ");
        set({ ...prev, syncError: `${t(get().language, "sync.saveFailed")} [${detail}]` });
      }
    });
  }

  function userId(): string {
    return get().session!.id;
  }

  return {
    session: null,
    settings: defaultSettings,
    products: [],
    movements: [],
    sales: [],
    expenses: [],
    dues: [],
    isDemo: false,
    hydrated: false,
    syncError: null,
    language: "en" as Language,
    setLanguage: (language) => set({ language }),

    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) return { ok: false, error: error?.message ?? t(get().language, "auth.signInFailed") };
      get().setSessionFromSupabase(data.user.id, data.user.email ?? email, data.user.user_metadata?.name);
      await get().hydrate(data.user.id);
      return { ok: true };
    },

    signUp: async (email, password, name) => {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
      if (error) return { ok: false, error: error.message };
      if (!data.user) return { ok: false, error: t(get().language, "auth.accountCreateFailed") };
      if (!data.session) {
        return { ok: false, error: t(get().language, "auth.confirmEmail") };
      }
      get().setSessionFromSupabase(data.user.id, data.user.email ?? email, name);
      await get().hydrate(data.user.id);
      return { ok: true };
    },

    signOut: async () => {
      if (!get().isDemo) await supabase.auth.signOut();
      get().clearAllData();
      set({ session: null });
    },

    setSessionFromSupabase: (id, email, name) => set({ session: { id, email, name }, isDemo: false }),

    hydrate: async (uid) => {
      let { settingsRes, productsRes, movementsRes, salesRes, expensesRes, duesRes } = await fetchAllTables(uid);

      // Supabase can very briefly report a freshly-issued JWT as "issued in the future"
      // due to a few seconds of clock drift between its own Auth and data-API services —
      // the same token is valid moments later. Retry once after a short wait instead of
      // treating this as real data loss.
      const allResults = [settingsRes, productsRes, movementsRes, salesRes, expensesRes, duesRes];
      if (allResults.some((r) => errorCode(r.error) === "PGRST303")) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        ({ settingsRes, productsRes, movementsRes, salesRes, expensesRes, duesRes } = await fetchAllTables(uid));
      }

      const fetchErrors = [
        ["business_settings", settingsRes.error],
        ["products", productsRes.error],
        ["stock_movements", movementsRes.error],
        ["sales", salesRes.error],
        ["expenses", expensesRes.error],
        ["dues", duesRes.error],
      ].filter(([, err]) => err);
      if (fetchErrors.length > 0) {
        console.error("Supabase hydrate fetch failed:", fetchErrors);
        set({
          syncError: `Couldn't load your data [${fetchErrors
            .map(([table, err]) => `${table}: ${describeSupabaseError(err)}`)
            .join(" | ")}]`,
        });
      }

      // Never let a failed read wipe out already-loaded good data with empty defaults —
      // only apply a table's fetched result if that specific query actually succeeded.
      let settings = settingsRes.error ? get().settings : settingsFromRow(settingsRes.data, defaultSettings);

      // One-time migration: accounts created before INR became the default currency
      // still have their old saved value. Upgrade them automatically, once, so nobody
      // has to manually flip the Settings dropdown just to see the new default.
      if (!settingsRes.error && !settings.currencyDefaultApplied) {
        settings = { ...settings, currency: "INR", currencyDefaultApplied: true };
        supabase
          .from("business_settings")
          .upsert({ user_id: uid, data: settings, updated_at: nowISO() })
          .then(({ error }) => {
            if (error) {
              console.error("Supabase currency migration failed:", error);
              set({ syncError: `Currency migration failed [${describeSupabaseError(error)}]` });
            }
          });
      }

      set({
        settings,
        products: productsRes.error ? get().products : (productsRes.data ?? []).map(productFromRow),
        movements: movementsRes.error ? get().movements : (movementsRes.data ?? []).map(movementFromRow),
        sales: salesRes.error ? get().sales : (salesRes.data ?? []).map(saleFromRow),
        expenses: expensesRes.error ? get().expenses : (expensesRes.data ?? []).map(expenseFromRow),
        dues: duesRes.error ? get().dues : (duesRes.data ?? []).map(dueFromRow),
        hydrated: true,
      });
    },

    dismissSyncError: () => set({ syncError: null }),

    updateSettings: (partial) => {
      const merged = { ...get().settings, ...partial };
      set({ settings: merged });
      if (get().isDemo || !get().session) return;
      supabase
        .from("business_settings")
        .upsert({ user_id: userId(), data: merged, updated_at: nowISO() })
        .then(({ error }) => {
          if (error) {
            console.error("Supabase settings save failed:", error);
            set({ syncError: `${t(get().language, "sync.settingsSaveFailed")} [${describeSupabaseError(error)}]` });
          }
        });
    },

    addProduct: (input) => {
      const product: Product = { ...input, id: id(), archived: false, createdAt: nowISO() };
      const prev = { products: get().products };
      set((s) => ({ products: [...s.products, product] }));
      if (get().isDemo) return;
      fireSync([supabase.from("products").insert(productToRow(userId(), product))], prev);
    },

    updateProduct: (productId, partial) => {
      const prev = { products: get().products };
      set((s) => ({ products: s.products.map((p) => (p.id === productId ? { ...p, ...partial } : p)) }));
      if (get().isDemo) return;
      const updated = get().products.find((p) => p.id === productId);
      if (!updated) return;
      fireSync(
        [supabase.from("products").update(productToRow(userId(), updated)).eq("id", productId).eq("user_id", userId())],
        prev
      );
    },

    archiveProduct: (productId) => {
      const prev = { products: get().products };
      set((s) => ({ products: s.products.map((p) => (p.id === productId ? { ...p, archived: true } : p)) }));
      if (get().isDemo) return;
      fireSync(
        [supabase.from("products").update({ archived: true }).eq("id", productId).eq("user_id", userId())],
        prev
      );
    },

    deleteProduct: (productId) => {
      const hasHistory =
        get().sales.some((sale) => sale.productId === productId) ||
        get().movements.some((m) => m.productId === productId);
      if (hasHistory) {
        get().archiveProduct(productId);
        return { ok: true, archived: true };
      }
      const prev = { products: get().products };
      set((s) => ({ products: s.products.filter((p) => p.id !== productId) }));
      if (!get().isDemo) {
        fireSync(
          [supabase.from("products").delete().eq("id", productId).eq("user_id", userId())],
          prev
        );
      }
      return { ok: true, archived: false };
    },

    stockIn: (productId, quantity, note) => {
      const prev = { products: get().products, movements: get().movements };
      const movement: StockMovement = { id: id(), productId, type: "stock_in", quantity, note, date: nowISO() };
      set((s) => ({
        products: s.products.map((p) => (p.id === productId ? { ...p, stock: p.stock + quantity } : p)),
        movements: [...s.movements, movement],
      }));
      if (get().isDemo) return;
      const updated = get().products.find((p) => p.id === productId);
      if (!updated) return;
      fireSync(
        [
          supabase.from("products").update({ stock: updated.stock }).eq("id", productId).eq("user_id", userId()),
          supabase.from("stock_movements").insert(movementToRow(userId(), movement)),
        ],
        prev
      );
    },

    stockAdjust: (productId, type, delta, note) => {
      const prev = { products: get().products, movements: get().movements };
      const movement: StockMovement = { id: id(), productId, type, quantity: delta, note, date: nowISO() };
      set((s) => ({
        products: s.products.map((p) => (p.id === productId ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
        movements: [...s.movements, movement],
      }));
      if (get().isDemo) return;
      const updated = get().products.find((p) => p.id === productId);
      if (!updated) return;
      fireSync(
        [
          supabase.from("products").update({ stock: updated.stock }).eq("id", productId).eq("user_id", userId()),
          supabase.from("stock_movements").insert(movementToRow(userId(), movement)),
        ],
        prev
      );
    },

    recordSale: (input) => {
      if (input.quantity <= 0) {
        return { ok: false, error: t(get().language, "money.invalidQuantity") };
      }

      const s = get();
      const date = input.date ?? nowISO();
      const isQuickCash = input.isQuickCash ?? !input.productId;

      if (input.productId && !isQuickCash) {
        const product = s.products.find((p) => p.id === input.productId);
        if (!product) return { ok: false, error: "Product not found." };
        if (input.quantity > product.stock) {
          return { ok: false, error: `Only ${product.stock} ${product.unit} available.` };
        }
      }

      const saleId = id();
      let linkedDueId: string | undefined;
      let movement: StockMovement | undefined;
      let due: Due | undefined;
      let sale!: Sale;
      const prev = { products: s.products, movements: s.movements, dues: s.dues, sales: s.sales };

      set((state) => {
        let products = state.products;
        let movements = state.movements;
        let dues = state.dues;

        if (input.productId && !isQuickCash) {
          products = products.map((p) => (p.id === input.productId ? { ...p, stock: p.stock - input.quantity } : p));
          movement = { id: id(), productId: input.productId, type: "sale", quantity: -input.quantity, date, relatedSaleId: saleId };
          movements = [...movements, movement];
        }

        if (input.paymentMethod === "credit") {
          linkedDueId = id();
          due = {
            id: linkedDueId,
            type: "customer",
            name: input.customerName?.trim() || "Walk-in customer",
            originalAmount: input.total,
            payments: [],
            status: "pending",
            createdAt: date,
            autoCreated: true,
          };
          dues = [...dues, due];
        }

        sale = {
          id: saleId,
          productId: input.productId,
          productName: input.productName,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          total: input.total,
          paymentMethod: input.paymentMethod,
          customerName: input.customerName,
          note: input.note,
          date,
          isQuickCash,
          linkedDueId,
        };

        return { products, movements, dues, sales: [sale, ...state.sales] };
      });

      if (!get().isDemo) {
        const writes: PromiseLike<{ error: unknown }>[] = [supabase.from("sales").insert(saleToRow(userId(), sale))];
        if (movement) {
          const updatedStock = get().products.find((p) => p.id === input.productId)?.stock;
          if (updatedStock !== undefined) {
            writes.push(
              supabase.from("products").update({ stock: updatedStock }).eq("id", input.productId!).eq("user_id", userId())
            );
          }
          writes.push(supabase.from("stock_movements").insert(movementToRow(userId(), movement)));
        }
        if (due) writes.push(supabase.from("dues").insert(dueToRow(userId(), due)));
        fireSync(writes, prev);
      }

      return { ok: true };
    },

    updateSale: (saleId, input) => {
      const existing = get().sales.find((sa) => sa.id === saleId);
      if (!existing) return { ok: false, error: "Sale not found." };

      const merged = { ...existing, ...input };
      if (merged.quantity <= 0) {
        return { ok: false, error: t(get().language, "money.invalidQuantity") };
      }

      // Reverse original effects
      get().deleteSale(saleId);

      return get().recordSale({
        productId: merged.productId,
        productName: merged.productName,
        quantity: merged.quantity,
        unitPrice: merged.unitPrice,
        total: merged.total,
        paymentMethod: merged.paymentMethod,
        customerName: merged.customerName,
        note: merged.note,
        date: merged.date,
        isQuickCash: merged.isQuickCash,
      });
    },

    deleteSale: (saleId) => {
      const sale = get().sales.find((sa) => sa.id === saleId);
      if (!sale) return;
      const prev = { sales: get().sales, products: get().products, movements: get().movements, dues: get().dues };
      set((s) => ({
        sales: s.sales.filter((sa) => sa.id !== saleId),
        products: sale.productId
          ? s.products.map((p) => (p.id === sale.productId ? { ...p, stock: p.stock + sale.quantity } : p))
          : s.products,
        movements: s.movements.filter((m) => m.relatedSaleId !== saleId),
        dues: sale.linkedDueId ? s.dues.filter((d) => d.id !== sale.linkedDueId) : s.dues,
      }));
      if (get().isDemo) return;
      const writes: PromiseLike<{ error: unknown }>[] = [
        supabase.from("sales").delete().eq("id", saleId).eq("user_id", userId()),
        supabase.from("stock_movements").delete().eq("related_sale_id", saleId).eq("user_id", userId()),
      ];
      if (sale.productId) {
        const updatedStock = get().products.find((p) => p.id === sale.productId)?.stock;
        if (updatedStock !== undefined) {
          writes.push(supabase.from("products").update({ stock: updatedStock }).eq("id", sale.productId).eq("user_id", userId()));
        }
      }
      if (sale.linkedDueId) writes.push(supabase.from("dues").delete().eq("id", sale.linkedDueId).eq("user_id", userId()));
      fireSync(writes, prev);
    },

    recordExpense: (input) => {
      const date = input.date ?? nowISO();
      const prev = { expenses: get().expenses, dues: get().dues };
      let due: Due | undefined;
      let expense!: Expense;

      set((s) => {
        let dues = s.dues;
        let linkedDueId: string | undefined;
        if (input.paymentMethod === "credit") {
          linkedDueId = id();
          due = {
            id: linkedDueId,
            type: "supplier",
            name: input.supplierName?.trim() || "Supplier",
            originalAmount: input.amount,
            payments: [],
            status: "pending",
            createdAt: date,
            autoCreated: true,
          };
          dues = [...dues, due];
        }
        expense = {
          id: id(),
          amount: input.amount,
          category: input.category,
          paymentMethod: input.paymentMethod,
          supplierName: input.supplierName,
          note: input.note,
          date,
          linkedDueId,
        };
        return { dues, expenses: [expense, ...s.expenses] };
      });

      if (get().isDemo) return;
      const writes: PromiseLike<{ error: unknown }>[] = [supabase.from("expenses").insert(expenseToRow(userId(), expense))];
      if (due) writes.push(supabase.from("dues").insert(dueToRow(userId(), due)));
      fireSync(writes, prev);
    },

    updateExpense: (expenseId, input) => {
      get().deleteExpense(expenseId);
      const merged = { ...input };
      get().recordExpense({
        amount: merged.amount ?? 0,
        category: merged.category ?? "other",
        paymentMethod: merged.paymentMethod ?? "cash",
        supplierName: merged.supplierName,
        note: merged.note,
        date: merged.date,
      });
    },

    deleteExpense: (expenseId) => {
      const expense = get().expenses.find((e) => e.id === expenseId);
      if (!expense) return;
      const prev = { expenses: get().expenses, dues: get().dues };
      set((s) => ({
        expenses: s.expenses.filter((e) => e.id !== expenseId),
        dues: expense.linkedDueId ? s.dues.filter((d) => d.id !== expense.linkedDueId) : s.dues,
      }));
      if (get().isDemo) return;
      const writes: PromiseLike<{ error: unknown }>[] = [
        supabase.from("expenses").delete().eq("id", expenseId).eq("user_id", userId()),
      ];
      if (expense.linkedDueId) writes.push(supabase.from("dues").delete().eq("id", expense.linkedDueId).eq("user_id", userId()));
      fireSync(writes, prev);
    },

    addDue: (input) => {
      const due: Due = {
        id: id(),
        type: input.type,
        name: input.name,
        originalAmount: input.originalAmount,
        payments: [],
        dueDate: input.dueDate,
        note: input.note,
        status: "pending",
        createdAt: nowISO(),
      };
      const prev = { dues: get().dues };
      set((s) => ({ dues: [...s.dues, due] }));
      if (get().isDemo) return;
      fireSync([supabase.from("dues").insert(dueToRow(userId(), due))], prev);
    },

    updateDue: (dueId, partial) => {
      const prev = { dues: get().dues };
      set((s) => ({ dues: s.dues.map((d) => (d.id === dueId ? recomputeDueStatus({ ...d, ...partial }) : d)) }));
      if (get().isDemo) return;
      const updated = get().dues.find((d) => d.id === dueId);
      if (!updated) return;
      fireSync([supabase.from("dues").update(dueToRow(userId(), updated)).eq("id", dueId).eq("user_id", userId())], prev);
    },

    deleteDue: (dueId) => {
      const prev = { dues: get().dues };
      set((s) => ({ dues: s.dues.filter((d) => d.id !== dueId) }));
      if (get().isDemo) return;
      fireSync([supabase.from("dues").delete().eq("id", dueId).eq("user_id", userId())], prev);
    },

    addDuePayment: (dueId, amount, date) => {
      const prev = { dues: get().dues };
      set((s) => ({
        dues: s.dues.map((d) =>
          d.id === dueId
            ? recomputeDueStatus({ ...d, payments: [...d.payments, { id: id(), amount, date: date ?? todayISO() }] })
            : d
        ),
      }));
      if (get().isDemo) return;
      const updated = get().dues.find((d) => d.id === dueId);
      if (!updated) return;
      fireSync([supabase.from("dues").update(dueToRow(userId(), updated)).eq("id", dueId).eq("user_id", userId())], prev);
    },

    settleDue: (dueId) => {
      const due = get().dues.find((d) => d.id === dueId);
      if (!due) return;
      const remaining = due.originalAmount - due.payments.reduce((s, p) => s + p.amount, 0);
      if (remaining > 0) {
        get().addDuePayment(dueId, remaining);
      }
    },

    undoSettleDue: (dueId) => {
      const prev = { dues: get().dues };
      set((s) => ({
        dues: s.dues.map((d) => {
          if (d.id !== dueId) return d;
          const payments = d.payments.slice(0, -1);
          return recomputeDueStatus({ ...d, payments });
        }),
      }));
      if (get().isDemo) return;
      const updated = get().dues.find((d) => d.id === dueId);
      if (!updated) return;
      fireSync([supabase.from("dues").update(dueToRow(userId(), updated)).eq("id", dueId).eq("user_id", userId())], prev);
    },

    loadDemoData: () => {
      const demo = buildDemoData();
      set({
        session: DEMO_SESSION,
        products: demo.products,
        movements: demo.movements,
        sales: demo.sales,
        expenses: demo.expenses,
        dues: demo.dues,
        settings: { ...get().settings, ...demo.settings, onboardingDismissed: true },
        isDemo: true,
        hydrated: true,
        syncError: null,
      });
    },

    resetDemoData: () => {
      get().loadDemoData();
    },

    clearAllData: () =>
      set({
        products: [],
        movements: [],
        sales: [],
        expenses: [],
        dues: [],
        isDemo: false,
        hydrated: false,
        syncError: null,
        settings: { ...defaultSettings },
      }),
  };
    },
    {
      name: "growmate-language",
      partialize: (s) => ({ language: s.language }),
    }
  )
);
