import { create } from "zustand";
import { persist } from "zustand/middleware";
import { t, type Language } from "../lib/i18n";
import type {
  AdvisorTurn,
  BusinessSettings,
  Currency,
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

  advisorConversation: AdvisorTurn[];
  addAdvisorTurn: (question: string) => void;
  resolveAdvisorTurn: (patch: Partial<AdvisorTurn>) => void;
  clearAdvisorConversation: () => void;

  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ ok: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  hydrate: (userId: string) => Promise<void>;
  setSessionFromSupabase: (userId: string, email: string, name?: string) => void;
  dismissSyncError: () => void;

  updateSettings: (partial: Partial<BusinessSettings>) => void;
  convertCurrency: (newCurrency: Currency, rate: number) => void;

  addProduct: (input: Omit<Product, "id" | "createdAt" | "archived">) => void;
  updateProduct: (productId: string, partial: Partial<Product>) => void;
  archiveProduct: (productId: string) => void;
  restoreProduct: (productId: string) => void;
  deleteProduct: (productId: string) => { ok: boolean; archived?: boolean };
  permanentlyDeleteProduct: (productId: string) => void;

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
    allowOverstock?: boolean;
  }) => { ok: boolean; error?: string; insufficientStock?: boolean };
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

const MISSING_COLUMN_PATTERN = /Could not find the '([a-zA-Z_]+)' column of '[a-zA-Z_]+' in the schema cache/;

// The live Supabase project's schema can lag behind what this app's code expects (e.g. a
// column added in a later app update that a given project's database never had a migration
// run for) — surfacing as PGRST204 "could not find column X in the schema cache". Rather than
// hard-failing the whole write over one field, retry once with that field stripped out, so
// the rest of the row (the part that actually matters for most operations) still saves.
async function writeWithColumnFallback(
  row: Record<string, unknown>,
  write: (row: Record<string, unknown>) => PromiseLike<{ error: unknown }>
): Promise<{ error: unknown }> {
  const result = await write(row);
  if (result.error) {
    const message = (result.error as { message?: string } | null)?.message ?? "";
    const match = message.match(MISSING_COLUMN_PATTERN);
    if (match && match[1] in row) {
      const retryRow = { ...row };
      delete retryRow[match[1]];
      return write(retryRow);
    }
  }
  return result;
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

  // Like fireSync, but awaits each write in order before starting the next — for the rare
  // case where one write's row is a hard (not-null) foreign key target of the next (e.g. a
  // new product's row must exist before its "created" stock_movements row can reference it).
  // Promise.all starts every request at once with no ordering guarantee between them, which
  // intermittently lost this exact race and violated stock_movements_product_id_fkey.
  function fireSyncSequential(writes: PromiseLike<{ error: unknown }>[], prev: Partial<StoreState>) {
    (async () => {
      for (const write of writes) {
        const { error } = await write;
        if (error) {
          console.error("Supabase write failed:", error);
          set({ ...prev, syncError: `${t(get().language, "sync.saveFailed")} [${describeSupabaseError(error)}]` });
          return;
        }
      }
    })();
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

    advisorConversation: [],
    addAdvisorTurn: (question) => set((s) => ({ advisorConversation: [...s.advisorConversation, { question, answer: null }] })),
    resolveAdvisorTurn: (patch) =>
      set((s) => {
        if (s.advisorConversation.length === 0) return {};
        const next = [...s.advisorConversation];
        next[next.length - 1] = { ...next[next.length - 1], ...patch };
        return { advisorConversation: next };
      }),
    clearAdvisorConversation: () => set({ advisorConversation: [] }),

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

    resetPassword: async (email) => {
      if (get().isDemo) return { ok: false, error: t(get().language, "auth.demoNoPasswordReset") };
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) return { ok: false, error: error.message };
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

    // Switching currency used to just relabel every amount without converting it (100 rupees
    // becoming "$100"). `rate` is always given as "1 USD = ₹rate" regardless of direction, so
    // the caller (a single exchange-rate input) doesn't need to know which way the multiplier
    // goes — that's worked out here from which currency is being switched to.
    convertCurrency: (newCurrency, rate) => {
      const s = get();
      if (newCurrency === s.settings.currency) return;
      const multiplier = newCurrency === "USD" ? 1 / rate : rate;
      const convert = (n: number) => Math.round(n * multiplier * 100) / 100;

      const prev = { products: s.products, sales: s.sales, expenses: s.expenses, dues: s.dues, settings: s.settings };

      const products = s.products.map((p) => ({ ...p, cost: convert(p.cost), sell: convert(p.sell) }));
      const sales = s.sales.map((sa) => ({
        ...sa,
        unitPrice: convert(sa.unitPrice),
        unitCost: sa.unitCost !== undefined ? convert(sa.unitCost) : undefined,
        total: convert(sa.total),
      }));
      const expenses = s.expenses.map((e) => ({ ...e, amount: convert(e.amount) }));
      const dues = s.dues.map((d) => ({
        ...d,
        originalAmount: convert(d.originalAmount),
        payments: d.payments.map((p) => ({ ...p, amount: convert(p.amount) })),
      }));
      const settings = { ...s.settings, currency: newCurrency, openingCashBalance: convert(s.settings.openingCashBalance) };

      set({ products, sales, expenses, dues, settings });

      if (s.isDemo || !s.session) return;
      const uid = userId();
      const writes: PromiseLike<{ error: unknown }>[] = [
        supabase.from("business_settings").upsert({ user_id: uid, data: settings, updated_at: nowISO() }),
        ...products.map((p) => supabase.from("products").update(productToRow(uid, p)).eq("id", p.id).eq("user_id", uid)),
        ...sales.map((sa) =>
          writeWithColumnFallback(saleToRow(uid, sa), (row) => supabase.from("sales").update(row).eq("id", sa.id).eq("user_id", uid))
        ),
        ...expenses.map((e) => supabase.from("expenses").update(expenseToRow(uid, e)).eq("id", e.id).eq("user_id", uid)),
        ...dues.map((d) => supabase.from("dues").update(dueToRow(uid, d)).eq("id", d.id).eq("user_id", uid)),
      ];
      fireSync(writes, prev);
    },

    addProduct: (input) => {
      const product: Product = { ...input, id: id(), archived: false, createdAt: nowISO() };
      const movement: StockMovement = { id: id(), productId: product.id, type: "created", quantity: product.stock, date: product.createdAt };
      const prev = { products: get().products, movements: get().movements };
      set((s) => ({ products: [...s.products, product], movements: [...s.movements, movement] }));
      if (get().isDemo) return;
      // Sequential, not fireSync's usual parallel Promise.all: stock_movements.product_id is
      // a not-null FK to products, so the product row must actually exist before the
      // movement row referencing it is inserted.
      fireSyncSequential(
        [
          supabase.from("products").insert(productToRow(userId(), product)),
          supabase.from("stock_movements").insert(movementToRow(userId(), movement)),
        ],
        prev
      );
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

    restoreProduct: (productId) => {
      const prev = { products: get().products };
      set((s) => ({ products: s.products.map((p) => (p.id === productId ? { ...p, archived: false } : p)) }));
      if (get().isDemo) return;
      fireSync(
        [supabase.from("products").update({ archived: false }).eq("id", productId).eq("user_id", userId())],
        prev
      );
    },

    permanentlyDeleteProduct: (productId) => {
      const prev = { products: get().products, movements: get().movements };
      set((s) => ({
        products: s.products.filter((p) => p.id !== productId),
        movements: s.movements.filter((m) => m.productId !== productId),
      }));
      if (get().isDemo) return;
      fireSync(
        [
          supabase.from("products").delete().eq("id", productId).eq("user_id", userId()),
          supabase.from("stock_movements").delete().eq("product_id", productId).eq("user_id", userId()),
        ],
        prev
      );
    },

    deleteProduct: (productId) => {
      // The "created" movement is logged for every product unconditionally (so its history
      // always shows when it was added), so it must not count as "real" usage history here —
      // otherwise every product, even one deleted seconds after creation with no sales or
      // stock activity, would always be archived instead of actually deleted.
      const hasHistory =
        get().sales.some((sale) => sale.productId === productId) ||
        get().movements.some((m) => m.productId === productId && m.type !== "created");
      if (hasHistory) {
        get().archiveProduct(productId);
        return { ok: true, archived: true };
      }
      const prev = { products: get().products, movements: get().movements };
      set((s) => ({
        products: s.products.filter((p) => p.id !== productId),
        movements: s.movements.filter((m) => m.productId !== productId),
      }));
      if (!get().isDemo) {
        fireSync(
          [
            supabase.from("products").delete().eq("id", productId).eq("user_id", userId()),
            supabase.from("stock_movements").delete().eq("product_id", productId).eq("user_id", userId()),
          ],
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

      let unitCost: number | undefined;
      if (input.productId && !isQuickCash) {
        const product = s.products.find((p) => p.id === input.productId);
        if (!product) return { ok: false, error: "Product not found." };
        if (input.quantity > product.stock && !input.allowOverstock) {
          return {
            ok: false,
            error: t(get().language, "money.onlyAvailable", { stock: product.stock, unit: t(get().language, `enums.unit.${product.unit}`) }),
            insufficientStock: true,
          };
        }
        unitCost = product.cost;
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
          products = products.map((p) => (p.id === input.productId ? { ...p, stock: Math.max(0, p.stock - input.quantity) } : p));
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
          unitCost,
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
        const writes: PromiseLike<{ error: unknown }>[] = [
          writeWithColumnFallback(saleToRow(userId(), sale), (row) => supabase.from("sales").insert(row)),
        ];
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
      // Keep whatever currency is already selected (including one the user just switched to
      // in demo mode) — demo.settings.currency is only the fallback for the very first load,
      // never something a later reset should overwrite.
      const currency = get().settings.currency ?? demo.settings.currency;
      set({
        session: DEMO_SESSION,
        products: demo.products,
        movements: demo.movements,
        sales: demo.sales,
        expenses: demo.expenses,
        dues: demo.dues,
        settings: { ...get().settings, ...demo.settings, currency, onboardingDismissed: true },
        isDemo: true,
        hydrated: true,
        syncError: null,
        advisorConversation: [],
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
        advisorConversation: [],
      }),
  };
    },
    {
      name: "growmate-language",
      // isDemo is persisted (unlike the rest of demo state) purely so a full page reload can
      // tell "was in a demo session" apart from "never signed in" and regenerate the same
      // demo dataset (see App.tsx) instead of bouncing the user to /auth — demo data is
      // deterministic (a fixed seed), so regenerating it reproduces exactly what was there.
      partialize: (s) => ({ language: s.language, advisorConversation: s.advisorConversation, isDemo: s.isDemo }),
    }
  )
);
