"use client";

import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { addMonths, firstDayOfMonth, nextMonth, toYMD } from "@/lib/date";
import { formatMoney } from "@/lib/format";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Category = {
  id: string;
  group_name: "income" | "expense" | "debt" | "misc";
  name: string;
  sort_order: number;
  is_archived: boolean;
};

type CreditCard = {
  id: string;
  name: string;
  current_balance: number;
};

type Txn = {
  id: string;
  date: string; // YYYY-MM-DD
  name: string | null; // optional now (we fallback in UI + insert)
  amount: number;
  category_id: string | null;
  credit_card_id: string | null;
};

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

  const [monthOffset, setMonthOffset] = useState(0);

  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);

  // form
  const [date, setDate] = useState(toYMD(new Date()));
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cardId, setCardId] = useState("");
  const [description, setDescription] = useState(""); // optional
  const [editId, setEditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editCardId, setEditCardId] = useState("");
  const [editDescription, setEditDescription] = useState("");

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

  // Any DEBT category containing "credit card" will require selecting a card
  const creditCardCategoryIds = useMemo(() => {
    return categories
      .filter(
        (c) =>
          c.group_name === "debt" && c.name.toLowerCase().includes("credit card")
      )
      .map((c) => c.id);
  }, [categories]);

  const needsCard = categoryId !== "" && creditCardCategoryIds.includes(categoryId);
  const editNeedsCard =
    editCategoryId !== "" && creditCardCategoryIds.includes(editCategoryId);

  useEffect(() => {
    if (!needsCard) setCardId("");
  }, [needsCard]);

  useEffect(() => {
    if (!editNeedsCard) setEditCardId("");
  }, [editNeedsCard]);

  function fallbackTxnName(
    catId: string,
    ccId: string | null,
    typed: string | null
  ) {
    const typedClean = (typed ?? "").trim();
    if (typedClean) return typedClean;

    const cat = categoryById.get(catId);
    const catName = cat?.name ?? "Transaction";

    if (creditCardCategoryIds.includes(catId)) {
      const card = ccId ? cardById.get(ccId) : null;
      const cardName = card?.name ?? "Credit Card";
      // Keep it human-readable
      return `Credit Card Payment - ${cardName}`;
    }

    return catName;
  }

  async function loadAll() {
    setMsg("");
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const { data: cats, error: catErr } = await supabase
        .from("categories")
        .select("id, group_name, name, sort_order, is_archived")
        .eq("is_archived", false)
        .order("group_name", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (catErr) throw catErr;
      setCategories((cats ?? []) as Category[]);

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

      const { data: rows, error: txErr } = await supabase
        .from("transactions")
        .select("id, date, name, amount, category_id, credit_card_id")
        .eq("user_id", u.user.id)
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
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const amt = Number(amount);
      if (!date) throw new Error("Pick a date.");
      if (!Number.isFinite(amt)) throw new Error("Enter a valid amount.");
      if (!categoryId) throw new Error("Pick a category.");
      if (needsCard && !cardId) throw new Error("Select a credit card.");

      // Payments are always positive amounts in this app
      if (amt <= 0) throw new Error("Amount must be greater than 0.");

      // IMPORTANT: Some schemas require transactions.name NOT NULL.
      // So we always send a name -- but we generate it if you leave description blank.
      const computedName = fallbackTxnName(
        categoryId,
        needsCard ? cardId : null,
        description
      );

      const payload: any = {
        user_id: u.user.id,
        source: "manual",
        date,
        name: computedName, // always safe
        amount: amt,
        category_id: categoryId,
        is_pending: false,
        credit_card_id: needsCard ? cardId : null,
      };

      const { error } = await supabase.from("transactions").insert([payload]);
      if (error) throw error;

      setAmount("");
      setDescription("");
      setMsg(needsCard ? "Payment saved." : "Transaction saved.");
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  function startEdit(t: Txn) {
    setEditId(t.id);
    setEditDate(t.date);
    setEditAmount(String(t.amount));
    setEditCategoryId(t.category_id ?? "");
    setEditCardId(t.credit_card_id ?? "");
    setEditDescription(t.name ?? "");
  }

  function cancelEdit() {
    setEditId(null);
    setEditDate("");
    setEditAmount("");
    setEditCategoryId("");
    setEditCardId("");
    setEditDescription("");
  }

  async function adjustCardBalance(cardId: string, delta: number) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) throw new Error("Credit card not found.");
    const next = card.current_balance + delta;
    const { error } = await supabase
      .from("credit_cards")
      .update({ current_balance: next })
      .eq("id", cardId);
    if (error) throw error;
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, current_balance: next } : c))
    );
  }

  async function saveEdit(t: Txn) {
    setMsg("");
    try {
      const amt = Number(editAmount);
      if (!editDate) throw new Error("Pick a date.");
      if (!Number.isFinite(amt)) throw new Error("Enter a valid amount.");
      if (amt <= 0) throw new Error("Amount must be greater than 0.");
      if (!editCategoryId) throw new Error("Pick a category.");
      if (editNeedsCard && !editCardId) throw new Error("Select a credit card.");

      const newName = fallbackTxnName(
        editCategoryId,
        editNeedsCard ? editCardId : null,
        editDescription
      );

      const payload: any = {
        date: editDate,
        name: newName,
        amount: amt,
        category_id: editCategoryId,
        credit_card_id: editNeedsCard ? editCardId : null,
      };

      const oldRequiresCard =
        !!t.category_id && creditCardCategoryIds.includes(t.category_id);
      const newRequiresCard = editNeedsCard;

      const oldCardId = t.credit_card_id ?? null;
      const newCardId = editNeedsCard ? editCardId : null;

      const { error } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", t.id);
      if (error) throw error;

      if (oldRequiresCard && newRequiresCard && oldCardId && newCardId) {
        if (oldCardId === newCardId) {
          const delta = t.amount - amt;
          if (delta !== 0) await adjustCardBalance(oldCardId, delta);
        } else {
          await adjustCardBalance(oldCardId, t.amount);
          await adjustCardBalance(newCardId, -amt);
        }
      } else if (oldRequiresCard && oldCardId) {
        await adjustCardBalance(oldCardId, t.amount);
      } else if (newRequiresCard && newCardId) {
        await adjustCardBalance(newCardId, -amt);
      }

      setTxns((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? {
                ...x,
                date: editDate,
                name: newName,
                amount: amt,
                category_id: editCategoryId,
                credit_card_id: editNeedsCard ? editCardId : null,
              }
            : x
        )
      );

      cancelEdit();
      setMsg("Transaction updated.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function deleteTxn(t: Txn) {
    setMsg("");
    try {
      const ok = confirm("Delete this transaction? This cannot be undone.");
      if (!ok) return;

      const oldRequiresCard =
        !!t.category_id && creditCardCategoryIds.includes(t.category_id);
      const oldCardId = t.credit_card_id ?? null;

      const { error } = await supabase.from("transactions").delete().eq("id", t.id);
      if (error) throw error;

      if (oldRequiresCard && oldCardId) {
        await adjustCardBalance(oldCardId, t.amount);
      }

      setTxns((prev) => prev.filter((x) => x.id !== t.id));
      setMsg("Transaction deleted.");
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

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const { data: rows, error } = await supabase
        .from("transactions")
        .select("credit_card_id, amount, category_id")
        .eq("user_id", u.user.id)
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
        const { error: upErr } = await supabase
          .from("credit_cards")
          .update({ current_balance: next })
          .eq("id", card.id);
        if (upErr) throw upErr;

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
            <h1 className="text-3xl font-bold">Transactions</h1>
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
          </div>
        </div>

        {msg && (
          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {msg}
          </div>
        )}

        {/* Add transaction */}
        <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">Add transaction</h2>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            {/* Date */}
            <label className="grid w-full gap-1 sm:w-auto">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Date</span>
              <input
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
  onChange={(e) => setCategoryId(e.target.value)}
  className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 sm:min-w-[240px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
>
  <option value="">Select category</option>

  {(["income", "expense", "debt", "misc"] as const).map((group) => {
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


            </label>

            {/* Card (conditional) */}
            {needsCard && (
              <label className="grid w-full gap-1 sm:w-auto">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Credit card
                </span>
                <select
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 sm:min-w-[240px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="">Select a card</option>
                  {cards.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Amount */}
            <label className="grid w-full gap-1 sm:w-auto">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Amount</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Target, Venmo, notes..."
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 sm:min-w-[260px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <button
              onClick={addTxn}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Add
            </button>
          </div>

          <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            Tip: Any <b>Debt</b> category containing <b>"credit card"</b> will ask you to pick a card.
          </div>
        </section>

        {/* List */}
        <section className="mt-8">
          <div className="space-y-3 md:hidden">
            {txns.length === 0 ? (
              <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                No transactions this month.
              </div>
            ) : (
              txns.map((t) => {
                const cat = t.category_id ? categoryById.get(t.category_id) : null;
                const card = t.credit_card_id ? cardById.get(t.credit_card_id) : null;

                const itemLabel =
                  t.category_id
                    ? fallbackTxnName(
                        t.category_id,
                        t.credit_card_id,
                        t.name ?? null
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
                              {(["income", "expense", "debt", "misc"] as const).map((group) => {
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
                                value={editCardId}
                                onChange={(e) => setEditCardId(e.target.value)}
                                className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                              >
                                <option value="">Select a card</option>
                                {cards.map((cc) => (
                                  <option key={cc.id} value={cc.id}>
                                    {cc.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                          <span>{cat ? `${cat.group_name} - ${cat.name}` : "--"}</span>
                          {card?.name ? (
                            <>
                              <span className="text-zinc-400">•</span>
                              <span>{card.name}</span>
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

          <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 md:block">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
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
                      No transactions this month.
                    </td>
                  </tr>
                ) : (
                  txns.map((t) => {
                    const cat = t.category_id ? categoryById.get(t.category_id) : null;
                    const card = t.credit_card_id ? cardById.get(t.credit_card_id) : null;

                    const itemLabel =
                      t.category_id
                        ? fallbackTxnName(
                            t.category_id,
                            t.credit_card_id,
                            t.name ?? null
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
                              {(["income", "expense", "debt", "misc"] as const).map((group) => {
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
                                value={editCardId}
                                onChange={(e) => setEditCardId(e.target.value)}
                                className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                              >
                                <option value="">Select a card</option>
                                {cards.map((cc) => (
                                  <option key={cc.id} value={cc.id}>
                                    {cc.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-zinc-600 dark:text-zinc-400">--</span>
                            )
                          ) : (
                            card?.name ?? "--"
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
