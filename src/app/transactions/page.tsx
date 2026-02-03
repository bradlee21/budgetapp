"use client";

import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";

type Category = {
  id: string;
  group_name: "income" | "expense" | "debt" | "misc";
  name: string;
};

type CreditCard = {
  id: string;
  name: string;
};

type Txn = {
  id: string;
  date: string; // YYYY-MM-DD
  name: string | null; // optional now (we fallback in UI + insert)
  amount: number;
  category_id: string | null;
  credit_card_id: string | null;
};

function firstDayOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function nextMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function addMonths(d: Date, m: number) {
  return new Date(d.getFullYear(), d.getMonth() + m, 1);
}
function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
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

  useEffect(() => {
    if (!needsCard) setCardId("");
  }, [needsCard]);

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
      return `Credit Card Payment • ${cardName}`;
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
        .select("id, group_name, name")
        .order("group_name", { ascending: true })
        .order("name", { ascending: true });

      if (catErr) throw catErr;
      setCategories((cats ?? []) as Category[]);

      const { data: cc, error: ccErr } = await supabase
        .from("credit_cards")
        .select("id, name")
        .order("name", { ascending: true });

      if (ccErr) throw ccErr;
      setCards((cc ?? []) as CreditCard[]);

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
      // So we always send a name — but we generate it if you leave description blank.
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

  async function deleteTxn(_id: string) {
    setMsg("Delete is disabled for now (we’ll add it safely with balance recalculation).");
  }

  return (
    <AuthGate>
      <main className="mx-auto mt-10 max-w-5xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Transactions</h1>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              {monthLabel} • {start} → {end}
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
              {loading ? "Refreshing…" : "Refresh"}
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
            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            {/* Category */}
            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Category</span>
          <select
  value={categoryId}
  onChange={(e) => setCategoryId(e.target.value)}
  className="min-w-[240px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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
              <label className="grid gap-1">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Credit card
                </span>
                <select
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  className="min-w-[240px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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
            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Amount</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="85.25"
                className="w-[140px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            {/* Description (optional) */}
            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Description (optional)
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Target, Venmo, notes…"
                className="min-w-[260px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <button
              onClick={addTxn}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Add
            </button>
          </div>

          <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            Tip: Any <b>Debt</b> category containing <b>“credit card”</b> will ask you to pick a card.
          </div>
        </section>

        {/* List */}
        <section className="mt-8">
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
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

                    return (
                      <tr
                        key={t.id}
                        className="border-t border-zinc-200 dark:border-zinc-800"
                      >
                        <td className="p-3">{t.date}</td>

                        <td className="p-3">
                          <div className="font-medium">{itemLabel}</div>
                          {!!t.name?.trim() && (
                            <div className="text-xs text-zinc-600 dark:text-zinc-400">
                              {t.name}
                            </div>
                          )}
                        </td>

                        <td className="p-3">
                          {cat ? `${cat.group_name} • ${cat.name}` : "—"}
                        </td>
                        <td className="p-3">{card?.name ?? "—"}</td>
                        <td className="p-3 text-right tabular-nums">
                          ${t.amount.toFixed(2)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => deleteTxn(t.id)}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            Delete/edit is intentionally paused until we add a safe “recalculate balances” flow.
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
