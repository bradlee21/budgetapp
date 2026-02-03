"use client";

import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type Category = {
  id: string;
  group_name: "income" | "expense" | "debt" | "misc";
  name: string;
};

type CreditCard = {
  id: string;
  name: string;
  current_balance: number;
};

type PlanItem = {
  type: "income" | "expense" | "debt";
  category_id: string;
  credit_card_id: string | null;
  amount: number;
};

type Txn = {
  category_id: string | null;
  credit_card_id: string | null;
  amount: number;
  date: string;
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
function toMonthKey(d: Date) {
  return firstDayOfMonth(d).toISOString().slice(0, 10);
}

export default function BudgetPage() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const [showDebug, setShowDebug] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [planRows, setPlanRows] = useState<PlanItem[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);

  const monthKey = useMemo(() => {
    const d = addMonths(new Date(), monthOffset);
    return toMonthKey(d);
  }, [monthOffset]);

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

  // NEW RULE: any DEBT category containing "credit card" is treated as "credit card payment"
  const creditCardCategoryIds = useMemo(() => {
    return categories
      .filter(
        (c) =>
          c.group_name === "debt" && c.name.toLowerCase().includes("credit card")
      )
      .map((c) => c.id);
  }, [categories]);

  const primaryCreditCardCategoryId = useMemo(() => {
    // choose a stable "primary" id for labeling keys; if multiple exist, just use the first.
    return creditCardCategoryIds[0] ?? "";
  }, [creditCardCategoryIds]);

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

      const { data: plan, error: planErr } = await supabase
        .from("planned_items")
        .select("type, category_id, credit_card_id, amount")
        .eq("user_id", u.user.id)
        .eq("month", monthKey);

      if (planErr) throw planErr;

      setPlanRows(
        (plan ?? []).map((p: any) => ({
          type: p.type,
          category_id: p.category_id,
          credit_card_id: p.credit_card_id ?? null,
          amount: Number(p.amount),
        }))
      );

      const { data: t, error: txErr } = await supabase
        .from("transactions")
        .select("category_id, credit_card_id, amount, date")
        .eq("user_id", u.user.id)
        .gte("date", start)
        .lt("date", end);

      if (txErr) throw txErr;

      setTxns(
        (t ?? []).map((x: any) => ({
          category_id: x.category_id ?? null,
          credit_card_id: x.credit_card_id ?? null,
          amount: Number(x.amount),
          date: x.date,
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
  }, [monthKey, start, end]);

  function money(n: number) {
    return `$${n.toFixed(2)}`;
  }

  // planned/actual maps keyed by:
  // - normal categories:  category_id::none
  // - credit card categories:  CC::cardId  (we bucket them per card)
  const plannedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of planRows) {
      if (creditCardCategoryIds.includes(p.category_id)) {
        const key = `CC::${p.credit_card_id ?? "none"}`;
        m.set(key, (m.get(key) ?? 0) + p.amount);
      } else {
        const key = `${p.category_id}::none`;
        m.set(key, (m.get(key) ?? 0) + p.amount);
      }
    }
    return m;
  }, [planRows, creditCardCategoryIds]);

  const actualMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txns) {
      if (!t.category_id) continue;

      if (creditCardCategoryIds.includes(t.category_id)) {
        const key = `CC::${t.credit_card_id ?? "none"}`;
        m.set(key, (m.get(key) ?? 0) + t.amount);
      } else {
        const key = `${t.category_id}::none`;
        m.set(key, (m.get(key) ?? 0) + t.amount);
      }
    }
    return m;
  }, [txns, creditCardCategoryIds]);

  // Totals
  const plannedIncome = useMemo(() => {
    return planRows
      .filter((p) => {
        const cat = categoryById.get(p.category_id);
        return cat?.group_name === "income";
      })
      .reduce((s, p) => s + p.amount, 0);
  }, [planRows, categoryById]);

  const plannedOut = useMemo(() => {
    return planRows
      .filter((p) => {
        const cat = categoryById.get(p.category_id);
        return cat?.group_name !== "income";
      })
      .reduce((s, p) => s + p.amount, 0);
  }, [planRows, categoryById]);

  const actualIncome = useMemo(() => {
    return txns
      .filter((t) => {
        const cat = t.category_id ? categoryById.get(t.category_id) : null;
        return cat?.group_name === "income";
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [txns, categoryById]);

  const actualOut = useMemo(() => {
    return txns
      .filter((t) => {
        const cat = t.category_id ? categoryById.get(t.category_id) : null;
        return cat?.group_name !== "income";
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [txns, categoryById]);

  const plannedNet = plannedIncome - plannedOut;
  const actualNet = actualIncome - actualOut;

  // Sections
  const incomeCats = categories.filter((c) => c.group_name === "income");
  const expenseCats = categories.filter((c) => c.group_name === "expense");
  const debtCats = categories.filter((c) => c.group_name === "debt");
  const miscCats = categories.filter((c) => c.group_name === "misc");

  function rowForCategory(catId: string) {
    const key = `${catId}::none`;
    const planned = plannedMap.get(key) ?? 0;
    const actual = actualMap.get(key) ?? 0;
    const remaining = planned - actual;
    return { planned, actual, remaining };
  }

  function cardRow(cardId: string) {
    const key = `CC::${cardId}`;
    const planned = plannedMap.get(key) ?? 0;
    const actual = actualMap.get(key) ?? 0;
    const remaining = planned - actual;
    return { planned, actual, remaining };
  }

  function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
      <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-lg font-semibold">{title}</div>
        <div className="mt-4 overflow-x-auto">{children}</div>
      </div>
    );
  }

  function Table({
    rows,
  }: {
    rows: Array<{
      label: string;
      planned: number;
      actual: number;
      remaining: number;
      extra?: string;
    }>;
  }) {
    return (
      <table className="w-full border-collapse text-sm">
        <thead className="text-zinc-700 dark:text-zinc-300">
          <tr>
            <th className="p-2 text-left">Item</th>
            <th className="p-2 text-right">Planned</th>
            <th className="p-2 text-right">Actual</th>
            <th className="p-2 text-right">Remaining</th>
          </tr>
        </thead>
        <tbody className="text-zinc-900 dark:text-zinc-100">
          {rows.length === 0 ? (
            <tr>
              <td className="p-2 text-zinc-600 dark:text-zinc-300" colSpan={4}>
                Nothing here yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.label}
                className="border-t border-zinc-200 dark:border-zinc-800"
              >
                <td className="p-2">
                  <div className="font-medium">{r.label}</div>
                  {r.extra && (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {r.extra}
                    </div>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">{money(r.planned)}</td>
                <td className="p-2 text-right tabular-nums">{money(r.actual)}</td>
                <td className="p-2 text-right tabular-nums">
                  {money(r.remaining)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    );
  }

  // Build section rows
  const incomeRows = incomeCats.map((c) => {
    const v = rowForCategory(c.id);
    return { label: c.name, ...v };
  });

  const expenseRows = expenseCats.map((c) => {
    const v = rowForCategory(c.id);
    return { label: c.name, ...v };
  });

  // Debt:
  // - per-card credit card payments (bucketed from ANY "credit card*" debt category)
  // - other debt categories shown normally, excluding the "credit card*" categories to avoid double-counting
  const debtRows = [
    ...cards.map((cc) => {
      const v = cardRow(cc.id);
      return {
        label: `Credit Card Payment • ${cc.name}`,
        extra: `Current balance: $${cc.current_balance.toFixed(2)}`,
        ...v,
      };
    }),
    ...debtCats
      .filter((c) => !creditCardCategoryIds.includes(c.id))
      .map((c) => {
        const v = rowForCategory(c.id);
        return { label: c.name, ...v };
      }),
  ];

  const miscRows = miscCats.map((c) => {
    const v = rowForCategory(c.id);
    return { label: c.name, ...v };
  });

  const ccCategoryLabel = useMemo(() => {
    if (creditCardCategoryIds.length === 0) return "";
    // show the first matching category name for reference
    const c = categories.find((x) => x.id === primaryCreditCardCategoryId);
    return c?.name ?? "";
  }, [creditCardCategoryIds.length, categories, primaryCreditCardCategoryId]);

  return (
    <AuthGate>
      <main className="mx-auto mt-10 max-w-5xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Budget</h1>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              {monthLabel}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

            <button
              onClick={() => setShowDebug((v) => !v)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Debug: {showDebug ? "On" : "Off"}
            </button>
          </div>
        </div>

        {showDebug && (
          <div className="mt-4 rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
            <div className="font-semibold">Debug panel</div>
            <div className="mt-2 grid gap-1">
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">monthKey:</span>{" "}
                <span className="font-mono">{monthKey}</span>
              </div>
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">start/end:</span>{" "}
                <span className="font-mono">
                  {start} → {end}
                </span>
              </div>
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">counts:</span>{" "}
                categories={categories.length}, cards={cards.length}, planned={planRows.length},
                txns={txns.length}
              </div>
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">totals:</span>{" "}
                plannedIncome={money(plannedIncome)}, plannedOut={money(plannedOut)}, plannedNet=
                {money(plannedNet)} | actualIncome={money(actualIncome)}, actualOut={money(actualOut)}
                , actualNet={money(actualNet)}
              </div>
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">
                  creditCardCategoryIds:
                </span>{" "}
                <span className="font-mono">
                  {creditCardCategoryIds.length ? creditCardCategoryIds.join(", ") : "(none)"}
                </span>
              </div>
              <div className="text-zinc-600 dark:text-zinc-400">
                If something looks off, screenshot this panel and tell me what action caused it.
              </div>
            </div>
          </div>
        )}

        {msg && (
          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {msg}
          </div>
        )}

        {/* Top summary */}
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">Planned</div>
            <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              Income:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {money(plannedIncome)}
              </span>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              Outflow:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {money(plannedOut)}
              </span>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              Net:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {money(plannedNet)}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">Actual</div>
            <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              Income:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {money(actualIncome)}
              </span>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              Outflow:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {money(actualOut)}
              </span>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              Net:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {money(actualNet)}
              </span>
            </div>
          </div>
        </section>

        <Section title="Income">
          <Table rows={incomeRows} />
        </Section>

        <Section title="Expenses">
          <Table rows={expenseRows} />
        </Section>

        <Section title="Debt">
          <Table rows={debtRows} />
          <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            Credit card payments are shown per card. We treat any Debt category containing{" "}
            <span className="font-semibold">“credit card”</span> as a credit card payment bucket.
            {ccCategoryLabel ? (
              <>
                {" "}
                Your current category is:{" "}
                <span className="font-semibold">{ccCategoryLabel}</span>.
              </>
            ) : (
              <>
                {" "}
                Create a Debt category named “Credit Card” or “Credit Card Payment”.
              </>
            )}
          </div>
        </Section>

        <Section title="Misc">
          <Table rows={miscRows} />
        </Section>
      </main>
    </AuthGate>
  );
}
