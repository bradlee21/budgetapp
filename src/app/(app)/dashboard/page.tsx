"use client";

import AuthGate from "@/components/AuthGate";
import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  firstDayOfMonth,
  nextMonth,
  toMonthKey,
  toYMD,
} from "@/lib/date";
import { formatMoney } from "@/lib/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

type PlanRow = {
  type: "income" | "expense";
  amount: number;
};

export default function DashboardPage() {
  const [msg, setMsg] = useState("");

  // Month selector: 0=this month, -1=last month
  const [monthOffset, setMonthOffset] = useState(0);

  // Actual totals
  const [actualIncome, setActualIncome] = useState<number | null>(null);
  const [actualExpenses, setActualExpenses] = useState<number | null>(null);

  // Planned totals
  const [plannedIncome, setPlannedIncome] = useState<number | null>(null);
  const [plannedExpenses, setPlannedExpenses] = useState<number | null>(null);

  //  Reliable theme detection
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;

    const compute = () => {
      const darkByClass = root.classList.contains("dark");
      const darkByMedia =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;

      // Prefer the class if present; fall back to media
      setIsDark(darkByClass || (!root.classList.contains("light") && darkByMedia));
    };

    compute();

    // watch class changes (theme toggles)
    const obs = new MutationObserver(compute);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });

    // watch OS theme changes
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => compute();
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);

    return () => {
      obs.disconnect();
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  const monthStart = useMemo(() => {
    const d = addMonths(new Date(), monthOffset);
    return toYMD(firstDayOfMonth(d));
  }, [monthOffset]);

  const monthEnd = useMemo(() => {
    const d = addMonths(new Date(), monthOffset);
    return toYMD(nextMonth(d));
  }, [monthOffset]);

  const monthKey = useMemo(() => {
    const d = addMonths(new Date(), monthOffset);
    return toMonthKey(d);
  }, [monthOffset]);

  const monthLabel = useMemo(() => {
    const d = addMonths(new Date(), monthOffset);
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [monthOffset]);

  async function refreshAll() {
    setMsg("");
    try {
      const res = await fetch(
        `/api/budget/bootstrap?month=${encodeURIComponent(
          monthKey
        )}&start=${encodeURIComponent(monthStart)}&end=${encodeURIComponent(monthEnd)}`,
        { cache: "no-store", credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load dashboard data.");

      const categories = (data?.categories ?? []) as Array<{
        id: string;
        group_name: string;
      }>;
      const categoryById = new Map(categories.map((c) => [c.id, c]));

      const txns = (data?.transactions ?? []) as Array<{
        amount: number;
        category_id: string | null;
      }>;
      const actualIncomeTotal = txns.reduce((sum, t) => {
        const cat = t.category_id ? categoryById.get(t.category_id) : null;
        return cat?.group_name === "income" ? sum + Number(t.amount) : sum;
      }, 0);
      const actualExpenseTotal = txns.reduce((sum, t) => {
        const cat = t.category_id ? categoryById.get(t.category_id) : null;
        return cat?.group_name === "expense" ? sum + Number(t.amount) : sum;
      }, 0);

      const planRows = (data?.plannedItems ?? []) as PlanRow[];
      const plannedIncomeTotal = planRows
        .filter((r) => r.type === "income")
        .reduce((s, r) => s + Number(r.amount), 0);
      const plannedExpenseTotal = planRows
        .filter((r) => r.type === "expense")
        .reduce((s, r) => s + Number(r.amount), 0);

      setActualIncome(actualIncomeTotal);
      setActualExpenses(actualExpenseTotal);
      setPlannedIncome(plannedIncomeTotal);
      setPlannedExpenses(plannedExpenseTotal);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, monthEnd, monthKey]);

  const chartData = useMemo(() => {
    return [
      { name: "Actual", Income: actualIncome ?? 0, Expenses: actualExpenses ?? 0 },
      { name: "Planned", Income: plannedIncome ?? 0, Expenses: plannedExpenses ?? 0 },
    ];
  }, [actualIncome, actualExpenses, plannedIncome, plannedExpenses]);

  // Theme tokens for chart text
  const gridColor = isDark ? "#3f3f46" : "#e4e4e7";
  const axisLine = isDark ? "#a1a1aa" : "#27272a";
  const tickColor = isDark ? "#e4e4e7" : "#18181b";

  return (
    <AuthGate>
      <main className="mx-auto mt-10 max-w-5xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              {monthLabel}
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
              onClick={refreshAll}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Refresh
            </button>
          </div>
        </div>

        {msg && (
          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {msg}
          </div>
        )}

        {/* Chart */}
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-lg font-semibold">Income vs Expenses</div>
          <div className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            Comparing Actual vs Planned for {monthLabel}
          </div>

          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />

                <XAxis
                  dataKey="name"
                  stroke={axisLine}
                  tick={{ fill: tickColor }}
                />

                <YAxis stroke={axisLine} tick={{ fill: tickColor }} />

                <Tooltip
                  formatter={(v: any) => formatMoney(Number(v), { sign: true })}
                  contentStyle={{
                    backgroundColor: isDark ? "#09090b" : "#ffffff",
                    borderColor: isDark ? "#27272a" : "#e4e4e7",
                    color: isDark ? "#fafafa" : "#09090b",
                  }}
                  labelStyle={{
                    color: isDark ? "#fafafa" : "#09090b",
                  }}
                  itemStyle={{
                    color: isDark ? "#fafafa" : "#09090b",
                  }}
                />

                <Legend
                  wrapperStyle={{
                    color: tickColor,
                  }}
                />

                <Bar
                  dataKey="Income"
                  fill={isDark ? "#22c55e" : "#16a34a"}
                  radius={[4, 4, 0, 0]}
                />

                <Bar
                  dataKey="Expenses"
                  fill={isDark ? "#ef4444" : "#dc2626"}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick totals (keeps things useful even if chart is empty) */}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">Actual</div>
            <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              Income:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formatMoney(actualIncome ?? 0, { sign: true })}
              </span>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              Expenses:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formatMoney(actualExpenses ?? 0, { sign: true })}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">Planned</div>
            <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              Income:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formatMoney(plannedIncome ?? 0, { sign: true })}
              </span>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              Expenses:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formatMoney(plannedExpenses ?? 0, { sign: true })}
              </span>
            </div>
          </div>
        </div>
      </main>
    </AuthGate>
  );
}
