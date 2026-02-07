"use client";

import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { addMonths, firstDayOfMonth, nextMonth, toYMD } from "@/lib/date";
import { formatMoney } from "@/lib/format";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Category = {
  id: string;
  group_name: "income" | "giving" | "savings" | "expense" | "debt" | "misc";
  name: string;
  parent_id: string | null;
  sort_order: number;
  is_archived: boolean;
};

type CreditCard = {
  id: string;
  name: string;
  current_balance: number;
};

type DebtAccount = {
  id: string;
  name: string;
  debt_type: "credit_card" | "loan" | "mortgage" | "student_loan" | "other";
  balance: number;
  apr: number | null;
  min_payment: number | null;
  due_date: string | null;
};

type Txn = {
  id: string;
  date: string; // YYYY-MM-DD
  name: string | null; // optional now (we fallback in UI + insert)
  amount: number;
  category_id: string | null;
  credit_card_id: string | null;
  debt_account_id: string | null;
};

const TXN_FORM_STORAGE_KEY = "budgetapp.txnForm";

function saveTxnFormDefaults(data: {
  categoryId: string;
  cardSelectId: string;
  debtAccountId: string;
}) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TXN_FORM_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

function loadTxnFormDefaults() {
  if (typeof window === "undefined") return null as null | {
    categoryId: string;
    cardSelectId: string;
    debtAccountId: string;
  };
  try {
    const raw = localStorage.getItem(TXN_FORM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      categoryId: typeof parsed.categoryId === "string" ? parsed.categoryId : "",
      cardSelectId: typeof parsed.cardSelectId === "string" ? parsed.cardSelectId : "",
      debtAccountId:
        typeof parsed.debtAccountId === "string" ? parsed.debtAccountId : "",
    };
  } catch {
    return null;
  }
}

function sortCategories(list: Category[]) {
  return list
    .slice()
    .sort(
      (a, b) =>
        a.group_name.localeCompare(b.group_name) ||
        a.sort_order - b.sort_order ||
        a.name.localeCompare(b.name)
    );
}

function hasCreditCardCategory(list: Category[]) {
  const byId = new Map(list.map((c) => [c.id, c]));
  return list.some((c) => {
    if (c.group_name !== "debt") return false;
    const name = c.name.toLowerCase();
    if (name.includes("credit card")) return true;
    if (c.parent_id) {
      const parent = byId.get(c.parent_id);
      return !!parent && parent.name.toLowerCase().includes("credit card");
    }
    return false;
  });
}

function SwipeRow({
  enabled,
  onDelete,
  deleteLabel = "Delete",
  children,
}: {
  enabled: boolean;
  onDelete: () => void;
  deleteLabel?: string;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const swipingRef = useRef(false);

  return (
    <div
      className="relative overflow-hidden"
      onTouchStart={(e) => {
        if (!enabled) return;
        const target = e.target as HTMLElement | null;
        if (offset !== 0 && target?.closest("[data-swipe-delete]")) {
          return;
        }
        if (offset !== 0) setOffset(0);
        const touch = e.touches[0];
        startXRef.current = touch.clientX;
        startYRef.current = touch.clientY;
        swipingRef.current = false;
      }}
      onTouchMove={(e) => {
        if (!enabled) return;
        const touch = e.touches[0];
        const dx = touch.clientX - startXRef.current;
        const dy = touch.clientY - startYRef.current;
        if (!swipingRef.current) {
          if (Math.abs(dx) > Math.abs(dy) + 6) {
            swipingRef.current = true;
          } else {
            return;
          }
        }
        if (dx < 0) {
          e.preventDefault();
          setOffset(Math.max(dx, -80));
        } else {
          setOffset(0);
        }
      }}
      onTouchEnd={() => {
        if (!enabled) return;
        if (swipingRef.current) {
          setOffset((prev) => (prev < -50 ? -80 : 0));
        }
        swipingRef.current = false;
      }}
    >
      {enabled && (
        <button
          data-swipe-delete
          onClick={() => {
            setOffset(0);
            onDelete();
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 h-full w-20 bg-red-600 text-xs font-semibold text-white"
        >
          {deleteLabel}
        </button>
      )}
      <div
        className="transition-transform duration-150"
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [monthOffset, setMonthOffset] = useState(0);

  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [debtAccounts, setDebtAccounts] = useState<DebtAccount[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);

  // form
  const [date, setDate] = useState(toYMD(new Date()));
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cardSelectId, setCardSelectId] = useState("");
  const [debtAccountId, setDebtAccountId] = useState("");
  const [description, setDescription] = useState(""); // optional
  const [editId, setEditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editCardSelectId, setEditCardSelectId] = useState("");
  const [editDebtAccountId, setEditDebtAccountId] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const addFormRef = useRef<HTMLDivElement | null>(null);
  const addDateRef = useRef<HTMLInputElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLInputElement | null>(null);

  const start = useMemo(() => {
    const d = addMonths(new Date(), monthOffset);
    return toYMD(firstDayOfMonth(d));
  }, [monthOffset]);

  const end = useMemo(() => {
    const d = addMonths(new Date(), monthOffset);
    return toYMD(nextMonth(d));
  }, [monthOffset]);

  const monthLabel = useMemo(() => {
    const d = addMonths(new Date(), monthOffset);
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [monthOffset]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const cardById = useMemo(() => {
    const map = new Map<string, CreditCard>();
    for (const c of cards) map.set(c.id, c);
    return map;
  }, [cards]);

  const debtById = useMemo(() => {
    const map = new Map<string, DebtAccount>();
    for (const d of debtAccounts) map.set(d.id, d);
    return map;
  }, [debtAccounts]);

  const cardLikeAccounts = useMemo(() => {
    const fromCards = cards.map((c) => ({
      kind: "card" as const,
      id: c.id,
      name: c.name,
    }));
    const fromDebt = debtAccounts
      .filter((d) => d.debt_type === "credit_card")
      .map((d) => ({
        kind: "debt" as const,
        id: d.id,
        name: d.name,
      }));
    return [...fromCards, ...fromDebt];
  }, [cards, debtAccounts]);

  // Any DEBT category containing "credit card" will require selecting a card
  const creditCardCategoryIds = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return categories
      .filter((c) => {
        if (c.group_name !== "debt") return false;
        const name = c.name.toLowerCase();
        if (name.includes("credit card")) return true;
        if (c.parent_id) {
          const parent = byId.get(c.parent_id);
          return !!parent && parent.name.toLowerCase().includes("credit card");
        }
        return false;
      })
      .map((c) => c.id);
  }, [categories]);

  const needsCard = categoryId !== "" && creditCardCategoryIds.includes(categoryId);
  const needsDebtAccount = useMemo(() => {
    if (!categoryId) return false;
    if (creditCardCategoryIds.includes(categoryId)) return false;
    const cat = categoryById.get(categoryId);
    return cat?.group_name === "debt";
  }, [categoryId, categoryById, creditCardCategoryIds]);

  const editNeedsCard =
    editCategoryId !== "" && creditCardCategoryIds.includes(editCategoryId);
  const editNeedsDebtAccount = useMemo(() => {
    if (!editCategoryId) return false;
    if (creditCardCategoryIds.includes(editCategoryId)) return false;
    const cat = categoryById.get(editCategoryId);
    return cat?.group_name === "debt";
  }, [editCategoryId, categoryById, creditCardCategoryIds]);

  useEffect(() => {
    if (!needsCard) setCardSelectId("");
  }, [needsCard]);

  useEffect(() => {
    if (!editNeedsCard) setEditCardSelectId("");
  }, [editNeedsCard]);

  useEffect(() => {
    if (!needsDebtAccount) setDebtAccountId("");
  }, [needsDebtAccount]);

  useEffect(() => {
    if (!editNeedsDebtAccount) setEditDebtAccountId("");
  }, [editNeedsDebtAccount]);

  useEffect(() => {
    const defaults = loadTxnFormDefaults();
    if (!defaults) return;
    if (defaults.categoryId) setCategoryId(defaults.categoryId);
    if (defaults.cardSelectId) setCardSelectId(defaults.cardSelectId);
    if (defaults.debtAccountId) setDebtAccountId(defaults.debtAccountId);
  }, []);

  function focusAddForm() {
    if (addFormRef.current) {
      addFormRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setTimeout(() => {
      addDateRef.current?.focus();
    }, 200);
  }

  function openAddForm() {
    setShowAddForm(true);
  }

  useEffect(() => {
    if (!showAddForm) return;
    focusAddForm();
  }, [showAddForm]);

  function parseCardSelectId(value: string) {
    if (!value) return null;
    if (value.startsWith("card:")) return { kind: "card" as const, id: value.slice(5) };
    if (value.startsWith("debt:")) return { kind: "debt" as const, id: value.slice(5) };
    return null;
  }

  function fallbackTxnName(
    catId: string,
    ccId: string | null,
    typed: string | null,
    debtId?: string | null
  ) {
    const typedClean = (typed ?? "").trim();
    if (typedClean) return typedClean;

    const cat = categoryById.get(catId);
    const catName = cat?.name ?? "Transaction";

    if (creditCardCategoryIds.includes(catId)) {
      const card = ccId ? cardById.get(ccId) : null;
      const debtCard = !card && debtId ? debtById.get(debtId) : null;
      const cardName = card?.name ?? debtCard?.name ?? "Credit Card";
      // Keep it human-readable
      return `Credit Card Payment - ${cardName}`;
    }

    if (cat?.group_name === "debt") {
      const debt = debtId ? debtById.get(debtId) : null;
      const debtName = debt?.name ?? "Debt";
      return `Debt Payment - ${debtName}`;
    }

    return catName;
  }

  async function ensureAuthedUser() {
    const { data: existing } = await supabase.auth.getUser();
    if (existing.user) return existing.user;
    try {
      const res = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      const session = data?.session;
      if (session?.access_token && session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        const { data: refreshed } = await supabase.auth.getUser();
        return refreshed.user ?? null;
      }
    } catch {
      return null;
    }
    return null;
  }

  async function loadAll() {
    setMsg("");
    setLoading(true);
    try {
      const user = await ensureAuthedUser();
      if (!user) return;

      const { data: cats, error: catErr } = await supabase
        .from("categories")
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .or("is_archived.is.null,is_archived.eq.false")
        .order("group_name", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (catErr) throw catErr;
      let nextCats = (cats ?? []) as Category[];
      if (!hasCreditCardCategory(nextCats)) {
        const ensureRes = await fetch("/api/budget/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "ensureCreditCardCategory" }),
        });
        const ensureData = await ensureRes.json();
        if (!ensureRes.ok) {
          throw new Error(
            ensureData?.error ?? "Failed to ensure credit card category."
          );
        }
        if (ensureData?.category) {
          nextCats = [...nextCats, ensureData.category as Category];
        }
      }
      setCategories(sortCategories(nextCats));

      const { data: cc, error: ccErr } = await supabase
        .from("credit_cards")
        .select("id, name, current_balance")
        .order("name", { ascending: true });

      if (ccErr) throw ccErr;
      setCards(
        (cc ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          current_balance: Number(c.current_balance),
        }))
      );

      const { data: debts, error: debtErr } = await supabase
        .from("debt_accounts")
        .select("id, name, debt_type, balance, apr, min_payment, due_date")
        .order("name", { ascending: true });
      if (debtErr) throw debtErr;
      setDebtAccounts(
        (debts ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          debt_type: (d.debt_type ?? "credit_card") as DebtAccount["debt_type"],
          balance: Number(d.balance),
          apr: d.apr === null ? null : Number(d.apr),
          min_payment: d.min_payment === null ? null : Number(d.min_payment),
          due_date: d.due_date ?? null,
        }))
      );

      const { data: rows, error: txErr } = await supabase
        .from("transactions")
        .select("id, date, name, amount, category_id, credit_card_id, debt_account_id")
        .eq("user_id", user.id)
        .gte("date", start)
        .lt("date", end)
        .order("date", { ascending: false });

      if (txErr) throw txErr;

      setTxns(
        (rows ?? []).map((t: any) => ({
          id: t.id,
          date: t.date,
          name: t.name ?? null,
          amount: Number(t.amount),
          category_id: t.category_id ?? null,
          credit_card_id: t.credit_card_id ?? null,
          debt_account_id: t.debt_account_id ?? null,
        }))
      );
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  async function addTxn() {
    setMsg("");
    try {
      const user = await ensureAuthedUser();
      if (!user) return;

      const amt = Number(amount);
      if (!date) throw new Error("Pick a date.");
      if (!Number.isFinite(amt)) throw new Error("Enter a valid amount.");
      if (!categoryId) throw new Error("Pick a category.");
      const cardSelection = needsCard ? parseCardSelectId(cardSelectId) : null;
      if (needsCard && !cardSelection) throw new Error("Select a credit card.");
      if (needsDebtAccount && !debtAccountId) throw new Error("Select a debt account.");

      // Payments are always positive amounts in this app
      if (amt <= 0) throw new Error("Amount must be greater than 0.");

      // IMPORTANT: Some schemas require transactions.name NOT NULL.
      // So we always send a name -- but we generate it if you leave description blank.
      const computedName = fallbackTxnName(
        categoryId,
        cardSelection?.kind === "card" ? cardSelection.id : null,
        description,
        needsDebtAccount
          ? debtAccountId
          : cardSelection?.kind === "debt"
          ? cardSelection.id
          : null
      );

      const payload: any = {
        source: "manual",
        date,
        name: computedName, // always safe
        amount: amt,
        category_id: categoryId,
        is_pending: false,
        credit_card_id: cardSelection?.kind === "card" ? cardSelection.id : null,
        debt_account_id: needsDebtAccount
          ? debtAccountId
          : cardSelection?.kind === "debt"
          ? cardSelection.id
          : null,
      };

      const res = await fetch("/api/budget/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "insert", ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to add transaction.");

      saveTxnFormDefaults({
        categoryId,
        cardSelectId,
        debtAccountId,
      });

      setAmount("");
      setDescription("");
      setCardSelectId("");
      setDebtAccountId("");
      setMsg(needsCard ? "Payment saved." : "Transaction saved.");
      await loadAll();
      setTimeout(() => {
        amountRef.current?.focus();
      }, 0);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  function startEdit(t: Txn) {
    setEditId(t.id);
    setEditDate(t.date);
    setEditAmount(String(t.amount));
    setEditCategoryId(t.category_id ?? "");
    setEditCardSelectId(
      t.credit_card_id
        ? `card:${t.credit_card_id}`
        : t.debt_account_id
        ? `debt:${t.debt_account_id}`
        : ""
    );
    setEditDebtAccountId(t.debt_account_id ?? "");
    setEditDescription(t.name ?? "");
  }

  function cancelEdit() {
    setEditId(null);
    setEditDate("");
    setEditAmount("");
    setEditCategoryId("");
    setEditCardSelectId("");
    setEditDebtAccountId("");
    setEditDescription("");
  }

  async function saveEdit(t: Txn) {
    setMsg("");
    try {
      const amt = Number(editAmount);
      if (!editDate) throw new Error("Pick a date.");
      if (!Number.isFinite(amt)) throw new Error("Enter a valid amount.");
      if (amt <= 0) throw new Error("Amount must be greater than 0.");
      if (!editCategoryId) throw new Error("Pick a category.");
      const cardSelection = editNeedsCard ? parseCardSelectId(editCardSelectId) : null;
      if (editNeedsCard && !cardSelection) throw new Error("Select a credit card.");
      if (editNeedsDebtAccount && !editDebtAccountId)
        throw new Error("Select a debt account.");

      const newName = fallbackTxnName(
        editCategoryId,
        cardSelection?.kind === "card" ? cardSelection.id : null,
        editDescription,
        editNeedsDebtAccount
          ? editDebtAccountId
          : cardSelection?.kind === "debt"
          ? cardSelection.id
          : null
      );

      const payload: any = {
        date: editDate,
        name: newName,
        amount: amt,
        category_id: editCategoryId,
        credit_card_id: cardSelection?.kind === "card" ? cardSelection.id : null,
        debt_account_id: editNeedsDebtAccount
          ? editDebtAccountId
          : cardSelection?.kind === "debt"
          ? cardSelection.id
          : null,
      };

      const res = await fetch("/api/budget/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "update",
          id: t.id,
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to update transaction.");

      cancelEdit();
      setMsg("Transaction updated.");
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function deleteTxn(t: Txn) {
    setMsg("");
    try {
      const ok = confirm("Delete this transaction? This cannot be undone.");
      if (!ok) return;

      const res = await fetch("/api/budget/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "delete", id: t.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete transaction.");

      setTxns((prev) => prev.filter((x) => x.id !== t.id));
      setMsg("Transaction deleted.");
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function recalcBalances() {
    setMsg("");
    try {
      const ok = confirm(
        "Recalculate balances from all credit card payment transactions? You will be prompted for starting balances."
      );
      if (!ok) return;

      if (creditCardCategoryIds.length === 0) {
        throw new Error("No credit card payment categories found.");
      }

      const user = await ensureAuthedUser();
      if (!user) return;

      const { data: rows, error } = await supabase
        .from("transactions")
        .select("credit_card_id, amount, category_id")
        .eq("user_id", user.id)
        .in("category_id", creditCardCategoryIds);
      if (error) throw error;

      const totals = new Map<string, number>();
      for (const r of rows ?? []) {
        if (!r.credit_card_id) continue;
        totals.set(
          r.credit_card_id,
          (totals.get(r.credit_card_id) ?? 0) + Number(r.amount)
        );
      }

      const updated: CreditCard[] = [];

      for (const card of cards) {
        const totalPaid = totals.get(card.id) ?? 0;
        const input = prompt(
          `Starting balance for ${card.name} (before any payments). Total payments: $${totalPaid.toFixed(
            2
          )}`,
          String(card.current_balance)
        );
        if (input === null) {
          updated.push(card);
          continue;
        }

        const starting = Number(input);
        if (!Number.isFinite(starting)) {
          throw new Error(`Starting balance for "${card.name}" must be a number.`);
        }

        const next = starting - totalPaid;
        const res = await fetch("/api/budget/credit-cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action: "update",
            id: card.id,
            current_balance: next,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to update credit card balance.");
        }

        updated.push({ ...card, current_balance: next });
      }

      setCards(updated);
      setMsg("Balances recalculated.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  return (
    <AuthGate>
      <main className="mx-auto mt-10 max-w-5xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold brand-text">Transactions</h1>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              {monthLabel} - {start} {"->"} {end}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              Month:
              <select
                value={monthOffset}
                onChange={(e) => setMonthOffset(Number(e.target.value))}
                className="ml-2 rounded-md border border-zinc-300 bg-white px-2 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value={0}>This month</option>
                <option value={-1}>Last month</option>
              </select>
            </label>

            <button
              onClick={loadAll}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <button
              onClick={recalcBalances}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Recalculate balances
            </button>

            <button
              onClick={openAddForm}
              className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              aria-label="Add transaction"
              title="Add transaction"
            >
              +
            </button>
          </div>
        </div>

        {msg && (
          <div className="mt-4 rounded-md border brand-border brand-panel p-3 text-sm text-zinc-900 dark:text-zinc-100">
            {msg}
          </div>
        )}

        {/* Add transaction */}
        {showAddForm && (
          <section
            ref={addFormRef}
            className="mt-8 rounded-lg border brand-border brand-panel p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold brand-text">Add transaction</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                Close
              </button>
            </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            {/* Date */}
            <label className="grid w-full gap-1 sm:w-auto">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Date</span>
              <input
                ref={addDateRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            {/* Category */}
            <label className="grid w-full gap-1 sm:w-auto">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Category</span>
              <select
                value={categoryId}
                onChange={(e) => {
                  const next = e.target.value;
                  setCategoryId(next);
                  if (next) {
                    setTimeout(() => {
                      amountRef.current?.focus();
                    }, 0);
                  }
                }}
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 sm:min-w-[240px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">Select category</option>
                {(["income", "giving", "savings", "expense", "debt", "misc"] as const).map(
                  (group) => {
                    const groupCats = categories.filter((c) => c.group_name === group);
                    if (groupCats.length === 0) return null;
                    return (
                      <optgroup
                        key={group}
                        label={group.charAt(0).toUpperCase() + group.slice(1)}
                      >
                        {groupCats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  }
                )}
              </select>
            </label>

            {/* Card (conditional) */}
            {needsCard && (
              <label className="grid w-full gap-1 sm:w-auto">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Credit card
                </span>
                <select
                  value={cardSelectId}
                  onChange={(e) => setCardSelectId(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 sm:min-w-[240px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="">Select a card</option>
                  {cardLikeAccounts.map((cc) => (
                    <option key={`${cc.kind}:${cc.id}`} value={`${cc.kind}:${cc.id}`}>
                      {cc.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {needsDebtAccount && (
              <label className="grid w-full gap-1 sm:w-auto">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Debt account
                </span>
                <select
                  value={debtAccountId}
                  onChange={(e) => setDebtAccountId(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 sm:min-w-[240px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="">Select a debt account</option>
                  {debtAccounts
                    .filter((d) => d.debt_type !== "credit_card")
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
            )}

            {/* Amount */}
            <label className="grid w-full gap-1 sm:w-auto">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Amount</span>
              <input
                ref={amountRef}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTxn();
                  }
                }}
                inputMode="decimal"
                placeholder="85.25"
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 sm:w-[140px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            {/* Description (optional) */}
            <label className="grid w-full gap-1 sm:w-auto">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Description (optional)
              </span>
              <input
                ref={descriptionRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTxn();
                  }
                }}
                placeholder="Target, Venmo, notes..."
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 sm:min-w-[260px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <button
              onClick={addTxn}
              className="btn-brand w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Add
            </button>
          </div>

          <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            Tip: Any <b>Debt</b> category containing <b>"credit card"</b> will ask you to pick
            a card. Other debt categories will ask for a debt account.
          </div>
          </section>
        )}

        {/* List */}
        <section className="mt-8">
          <div className="space-y-3 md:hidden">
            {txns.length === 0 ? (
              <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                <div>No transactions this month.</div>
                <button
                  onClick={openAddForm}
                  className="btn-brand mt-2 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  Add transaction
                </button>
              </div>
            ) : (
              txns.map((t) => {
                const cat = t.category_id ? categoryById.get(t.category_id) : null;
                const card = t.credit_card_id ? cardById.get(t.credit_card_id) : null;
                const debt = t.debt_account_id ? debtById.get(t.debt_account_id) : null;

                const itemLabel =
                  t.category_id
                    ? fallbackTxnName(
                        t.category_id,
                        t.credit_card_id,
                        t.name ?? null,
                        t.debt_account_id ?? null
                      )
                    : (t.name ?? "Transaction");

                const isEditing = editId === t.id;

                return (
                  <SwipeRow
                    key={t.id}
                    enabled={!isEditing}
                    onDelete={() => deleteTxn(t)}
                    deleteLabel="Delete"
                  >
                    <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        ) : (
                          t.date
                        )}
                      </div>
                      <div className="text-right text-sm font-semibold tabular-nums">
                        {isEditing ? (
                          <input
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            inputMode="decimal"
                            className="w-[120px] rounded-md border border-zinc-300 bg-white p-2 text-right text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        ) : (
                          formatMoney(t.amount)
                        )}
                      </div>
                    </div>

                    <div className="mt-3">
                      {isEditing ? (
                        <input
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Target, Venmo, notes..."
                          className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      ) : (
                        <>
                          <div className="font-medium">{itemLabel}</div>
                          {!!t.name?.trim() && (
                            <div className="text-xs text-zinc-600 dark:text-zinc-400">
                              {t.name}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="mt-3">
                      {isEditing ? (
                        <div className="grid gap-2 text-sm">
                          <div>
                            <div className="text-xs text-zinc-600 dark:text-zinc-400">
                              Category
                            </div>
                            <select
                              value={editCategoryId}
                              onChange={(e) => setEditCategoryId(e.target.value)}
                              className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            >
                              <option value="">Select category</option>
                              {(["income", "giving", "savings", "expense", "debt", "misc"] as const).map(
                                (group) => {
                                const groupCats = categories.filter((c) => c.group_name === group);
                                if (groupCats.length === 0) return null;
                                return (
                                  <optgroup
                                    key={group}
                                    label={group.charAt(0).toUpperCase() + group.slice(1)}
                                  >
                                    {groupCats.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                );
                              })}
                            </select>
                          </div>

                          {editNeedsCard && (
                            <div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                Credit card
                              </div>
                              <select
                                value={editCardSelectId}
                                onChange={(e) => setEditCardSelectId(e.target.value)}
                                className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                              >
                                <option value="">Select a card</option>
                                {cardLikeAccounts.map((cc) => (
                                  <option key={`${cc.kind}:${cc.id}`} value={`${cc.kind}:${cc.id}`}>
                                    {cc.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {editNeedsDebtAccount && (
                            <div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                Debt account
                              </div>
                              <select
                                value={editDebtAccountId}
                                onChange={(e) => setEditDebtAccountId(e.target.value)}
                                className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                              >
                                <option value="">Select a debt account</option>
                                {debtAccounts
                                  .filter((d) => d.debt_type !== "credit_card")
                                  .map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                          <span>{cat ? `${cat.group_name} - ${cat.name}` : "--"}</span>
                          {card?.name || debt?.name ? (
                            <>
                              <span className="text-zinc-400">-</span>
                              <span>{card?.name ?? debt?.name}</span>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEdit(t)}
                            className="btn-brand rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEdit(t)}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                  </SwipeRow>
                );
              })
            )}
          </div>

          <div className="hidden overflow-x-hidden rounded-lg border brand-border border-zinc-200 dark:border-zinc-800 sm:overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead className="brand-table-head text-zinc-900 dark:text-zinc-100">
                <tr>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Item</th>
                  <th className="p-3 text-left">Category</th>
                  <th className="p-3 text-left">Card</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3"></th>
                </tr>
              </thead>

              <tbody className="bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                {txns.length === 0 ? (
                  <tr>
                    <td className="p-3 text-zinc-600 dark:text-zinc-300" colSpan={6}>
                      <div>No transactions this month.</div>
                      <button
                          onClick={openAddForm}
                        className="btn-brand mt-2 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Add transaction
                      </button>
                    </td>
                  </tr>
                ) : (
                  txns.map((t) => {
                    const cat = t.category_id ? categoryById.get(t.category_id) : null;
                    const card = t.credit_card_id ? cardById.get(t.credit_card_id) : null;
                    const debt = t.debt_account_id ? debtById.get(t.debt_account_id) : null;

                    const itemLabel =
                      t.category_id
                        ? fallbackTxnName(
                            t.category_id,
                            t.credit_card_id,
                            t.name ?? null,
                            t.debt_account_id ?? null
                          )
                        : (t.name ?? "Transaction");

                    const isEditing = editId === t.id;

                    return (
                      <tr
                        key={t.id}
                        className="border-t border-zinc-200 dark:border-zinc-800"
                        onContextMenu={
                          isEditing
                            ? undefined
                            : (e) => {
                                e.preventDefault();
                                deleteTxn(t);
                              }
                        }
                      >
                        <td className="p-3">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            />
                          ) : (
                            t.date
                          )}
                        </td>

                        <td className="p-3">
                          {isEditing ? (
                            <input
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="Target, Venmo, notes..."
                              className="min-w-[220px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            />
                          ) : (
                            <>
                              <div className="font-medium">{itemLabel}</div>
                              {!!t.name?.trim() && (
                                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                  {t.name}
                                </div>
                              )}
                            </>
                          )}
                        </td>

                        <td className="p-3">
                          {isEditing ? (
                            <select
                              value={editCategoryId}
                              onChange={(e) => setEditCategoryId(e.target.value)}
                              className="min-w-[200px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            >
                              <option value="">Select category</option>
                              {(["income", "giving", "savings", "expense", "debt", "misc"] as const).map(
                                (group) => {
                                const groupCats = categories.filter(
                                  (c) => c.group_name === group
                                );
                                if (groupCats.length === 0) return null;

                                return (
                                  <optgroup
                                    key={group}
                                    label={group.charAt(0).toUpperCase() + group.slice(1)}
                                  >
                                    {groupCats.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                );
                              })}
                            </select>
                          ) : cat ? (
                            `${cat.group_name} - ${cat.name}`
                          ) : (
                            "--"
                          )}
                        </td>
                        <td className="p-3">
                          {isEditing ? (
                            editNeedsCard ? (
                              <select
                                value={editCardSelectId}
                                onChange={(e) => setEditCardSelectId(e.target.value)}
                                className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                              >
                                <option value="">Select a card</option>
                                {cardLikeAccounts.map((cc) => (
                                  <option key={`${cc.kind}:${cc.id}`} value={`${cc.kind}:${cc.id}`}>
                                    {cc.name}
                                  </option>
                                ))}
                              </select>
                            ) : editNeedsDebtAccount ? (
                              <select
                                value={editDebtAccountId}
                                onChange={(e) => setEditDebtAccountId(e.target.value)}
                                className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                              >
                                <option value="">Select a debt account</option>
                                {debtAccounts
                                  .filter((d) => d.debt_type !== "credit_card")
                                  .map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <span className="text-zinc-600 dark:text-zinc-400">--</span>
                            )
                          ) : (
                            card?.name ?? debt?.name ?? "--"
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {isEditing ? (
                            <input
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              inputMode="decimal"
                              className="w-[120px] rounded-md border border-zinc-300 bg-white p-2 text-right text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            />
                          ) : (
                            `$${t.amount.toFixed(2)}`
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => saveEdit(t)}
                                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => startEdit(t)}
                                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            Edit/delete updates balances for credit card payment transactions. Recalculate will
            prompt for starting balances and recompute from all payments.
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
