"use client";

import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { addMonths, firstDayOfMonth, nextMonth, toYMD } from "@/lib/date";
import { formatMoney } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";

type Category = {
  id: string;
  group_name: "income" | "expense" | "debt" | "misc";
  name: string;
  is_archived: boolean;
};

type Txn = {
  amount: number;
  category_id: string | null;
  date: string;
};

export default function ReportsPage() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);

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
        .select("id, group_name, name, is_archived")
        .or("is_archived.is.null,is_archived.eq.false")
        .order("group_name", { ascending: true })
        .order("name", { ascending: true });
      if (catErr) throw catErr;
      setCategories((cats ?? []) as Category[]);

      const { data: rows, error: txErr } = await supabase
        .from("transactions")
        .select("amount, category_id, date")
        .eq("user_id", user.id)
        .gte("date", start)
        .lt("date", end);
      if (txErr) throw txErr;

      setTxns(
        (rows ?? []).map((r: any) => ({
          amount: Number(r.amount),
          category_id: r.category_id ?? null,
          date: r.date,
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

  const totalIncome = useMemo(() => {
    return txns
      .filter((t) => {
        const cat = t.category_id ? categoryById.get(t.category_id) : null;
        return cat?.group_name === "income";
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [txns, categoryById]);

  const totalExpense = useMemo(() => {
    return txns
      .filter((t) => {
        const cat = t.category_id ? categoryById.get(t.category_id) : null;
        return cat?.group_name === "expense";
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [txns, categoryById]);

  const totalDebt = useMemo(() => {
    return txns
      .filter((t) => {
        const cat = t.category_id ? categoryById.get(t.category_id) : null;
        return cat?.group_name === "debt";
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [txns, categoryById]);

  const cashflow = totalIncome - totalExpense - totalDebt;

  const daily = useMemo(() => {
    const map = new Map<string, { income: number; out: number }>();
    for (const t of txns) {
      const cat = t.category_id ? categoryById.get(t.category_id) : null;
      if (!cat) continue;
      const key = t.date;
      const row = map.get(key) ?? { income: 0, out: 0 };
      if (cat.group_name === "income") row.income += t.amount;
      if (cat.group_name === "expense" || cat.group_name === "debt")
        row.out += t.amount;
      map.set(key, row);
    }
    const keys = Array.from(map.keys()).sort();
    return keys.map((date) => ({ date, ...map.get(date)! }));
  }, [txns, categoryById]);

  return (
    <AuthGate>
      <main className="mx-auto mt-10 max-w-5xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              Monthly cashflow - {monthLabel}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={monthOffset}
              onChange={(e) => setMonthOffset(Number(e.target.value))}
              className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              <option value={0}>This month</option>
              <option value={-1}>Last month</option>
            </select>

            <button
              onClick={loadAll}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {msg && (
          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {msg}
          </div>
        )}

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">Income</div>
            <div className="mt-2 text-2xl font-semibold">
              {formatMoney(totalIncome)}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">Expenses</div>
            <div className="mt-2 text-2xl font-semibold">
              {formatMoney(totalExpense)}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">Debt payments</div>
            <div className="mt-2 text-2xl font-semibold">
              {formatMoney(totalDebt)}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm text-zinc-700 dark:text-zinc-300">Net cashflow</div>
          <div className="mt-2 text-3xl font-semibold">{formatMoney(cashflow)}</div>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Net = income - expenses - debt payments
          </div>
        </section>

        <section className="mt-8">
          <div className="text-lg font-semibold">Daily cashflow</div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                <tr>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-right">Income</th>
                  <th className="p-3 text-right">Outflow</th>
                  <th className="p-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                {daily.length === 0 ? (
                  <tr>
                    <td className="p-3 text-zinc-600 dark:text-zinc-300" colSpan={4}>
                      No transactions this month.
                    </td>
                  </tr>
                ) : (
                  daily.map((d) => (
                    <tr
                      key={d.date}
                      className="border-t border-zinc-200 dark:border-zinc-800"
                    >
                      <td className="p-3">{d.date}</td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(d.income)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(d.out)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(d.income - d.out)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
