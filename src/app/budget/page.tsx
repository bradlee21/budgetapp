"use client";

import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import {
  addMonths,
  firstDayOfMonth,
  nextMonth,
  toMonthKey,
  toYMD,
} from "@/lib/date";
import { formatMoney } from "@/lib/format";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type Category = {
  id: string;
  group_name: "income" | "expense" | "debt" | "misc";
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
  balance: number;
  apr: number | null;
  min_payment: number | null;
  due_date: string | null;
};

type PlanItem = {
  id: string;
  type: "income" | "expense" | "debt";
  category_id: string;
  credit_card_id: string | null;
  name: string;
  amount: number;
};

type Txn = {
  id: string;
  name: string | null;
  category_id: string | null;
  credit_card_id: string | null;
  debt_account_id: string | null;
  amount: number;
  date: string;
};

type BudgetMonth = {
  id: string;
  user_id: string;
  month: string;
  available_start: number;
  available_end: number;
};

type BudgetRow = {
  id: string;
  label: string;
  planned: number;
  actual: number;
  remaining: number;
  extra?: string;
  editable?: boolean;
  indent?: number;
  orderableCategoryId?: string;
};

function Section({
  title,
  header,
  children,
}: {
  title: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-semibold">{title}</div>
        {header}
      </div>
      <div className="mt-4 overflow-x-auto">{children}</div>
    </div>
  );
}

function BudgetTable({
  rows,
  onDrop,
  editPlannedKey,
  editPlannedAmount,
  setEditPlannedAmount,
  onSavePlanned,
  onCancelPlanned,
  onStartEditPlanned,
  setDragCategoryId,
}: {
  rows: BudgetRow[];
  onDrop: (categoryId: string) => void;
  editPlannedKey: string | null;
  editPlannedAmount: string;
  setEditPlannedAmount: (v: string) => void;
  onSavePlanned: (rowId: string) => void;
  onCancelPlanned: () => void;
  onStartEditPlanned: (rowId: string, planned: number) => void;
  setDragCategoryId: (id: string | null) => void;
}) {
  const showOrder = rows.some((r) => r.orderableCategoryId);
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="text-zinc-700 dark:text-zinc-300">
        <tr>
          <th className="p-2 text-left">Item</th>
          {showOrder && <th className="p-2 text-right">Order</th>}
          <th className="p-2 text-right">Planned</th>
          <th className="p-2 text-right">Actual</th>
          <th className="p-2 text-right">Remaining</th>
        </tr>
      </thead>
      <tbody className="text-zinc-900 dark:text-zinc-100">
        {rows.length === 0 ? (
          <tr>
            <td
              className="p-2 text-zinc-600 dark:text-zinc-300"
              colSpan={showOrder ? 5 : 4}
            >
              Nothing here yet.
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr
              key={r.id}
              className="border-t border-zinc-200 dark:border-zinc-800"
              draggable={!!r.orderableCategoryId}
              onDragStart={
                r.orderableCategoryId
                  ? (e) => {
                      setDragCategoryId(r.orderableCategoryId!);
                      e.dataTransfer.setData(
                        "text/plain",
                        r.orderableCategoryId!
                      );
                      e.dataTransfer.effectAllowed = "move";
                    }
                  : undefined
              }
              onDragEnd={r.orderableCategoryId ? () => setDragCategoryId(null) : undefined}
              onDragOver={
                r.orderableCategoryId ? (e) => e.preventDefault() : undefined
              }
              onDrop={
                r.orderableCategoryId
                  ? () => onDrop(r.orderableCategoryId!)
                  : undefined
              }
            >
              <td className="p-2">
                <div className="flex items-center gap-2">
                  <div
                    className="font-medium"
                    style={{ paddingLeft: (r.indent ?? 0) * 16 }}
                  >
                    {r.label}
                  </div>
                </div>
                {r.extra && (
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {r.extra}
                  </div>
                )}
              </td>
              {showOrder && (
                <td className="p-2 text-right">
                  {r.orderableCategoryId ? (
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        title="Drag to reorder"
                        aria-label="Drag to reorder"
                        onMouseDown={(e) => e.stopPropagation()}
                        className="cursor-grab rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        ::
                      </button>
                    </div>
                  ) : (
                    <span className="text-zinc-500">--</span>
                  )}
                </td>
              )}
              <td className="p-2 text-right tabular-nums">
                {r.editable === false ? (
                  formatMoney(r.planned)
                ) : editPlannedKey === r.id ? (
                  <div className="flex items-center justify-end gap-2">
                    <input
                      value={editPlannedAmount}
                      onChange={(e) => setEditPlannedAmount(e.target.value)}
                      inputMode="decimal"
                      autoFocus
                      className="w-[120px] rounded-md border border-zinc-300 bg-white p-2 text-right text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      onClick={() => onSavePlanned(r.id)}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                    >
                      Save
                    </button>
                    <button
                      onClick={onCancelPlanned}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onStartEditPlanned(r.id, r.planned)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    title="Edit planned total"
                  >
                    {formatMoney(r.planned)}
                  </button>
                )}
              </td>
              <td className="p-2 text-right tabular-nums">
                {formatMoney(r.actual)}
              </td>
              <td className="p-2 text-right tabular-nums">
                {formatMoney(r.remaining)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export default function BudgetPage() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const [showDebug, setShowDebug] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [debtAccounts, setDebtAccounts] = useState<DebtAccount[]>([]);
  const [planRows, setPlanRows] = useState<PlanItem[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [budgetMonth, setBudgetMonth] = useState<BudgetMonth | null>(null);
  const [availableStart, setAvailableStart] = useState("");
  const [availableDirty, setAvailableDirty] = useState(false);
  const [savingAvailable, setSavingAvailable] = useState(false);
  const [editPlannedKey, setEditPlannedKey] = useState<string | null>(null);
  const [editPlannedAmount, setEditPlannedAmount] = useState("");
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState({
    income: "",
    expense: "",
    debt: "",
    misc: "",
  });
  const [newCatParent, setNewCatParent] = useState({
    income: "",
    expense: "",
    debt: "",
    misc: "",
  });

  const [txnDate, setTxnDate] = useState(toYMD(new Date()));
  const [txnAmount, setTxnAmount] = useState("");
  const [txnCategoryId, setTxnCategoryId] = useState("");
  const [txnCardId, setTxnCardId] = useState("");
  const [txnDebtAccountId, setTxnDebtAccountId] = useState("");
  const [txnDescription, setTxnDescription] = useState("");
  const [editTxnId, setEditTxnId] = useState<string | null>(null);
  const [editTxnDate, setEditTxnDate] = useState("");
  const [editTxnAmount, setEditTxnAmount] = useState("");
  const [editTxnCategoryId, setEditTxnCategoryId] = useState("");
  const [editTxnCardId, setEditTxnCardId] = useState("");
  const [editTxnDebtAccountId, setEditTxnDebtAccountId] = useState("");
  const [editTxnDescription, setEditTxnDescription] = useState("");

  const [debtName, setDebtName] = useState("");
  const [debtBalance, setDebtBalance] = useState("");
  const [debtApr, setDebtApr] = useState("");
  const [debtMinPayment, setDebtMinPayment] = useState("");
  const [debtDueDate, setDebtDueDate] = useState("");

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

  const debtById = useMemo(() => {
    const map = new Map<string, DebtAccount>();
    for (const d of debtAccounts) map.set(d.id, d);
    return map;
  }, [debtAccounts]);

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

  const txnNeedsCard =
    txnCategoryId !== "" && creditCardCategoryIds.includes(txnCategoryId);
  const txnNeedsDebtAccount = useMemo(() => {
    if (!txnCategoryId) return false;
    if (creditCardCategoryIds.includes(txnCategoryId)) return false;
    const cat = categoryById.get(txnCategoryId);
    return cat?.group_name === "debt";
  }, [txnCategoryId, categoryById, creditCardCategoryIds]);

  const editTxnNeedsDebtAccount = useMemo(() => {
    if (!editTxnCategoryId) return false;
    if (creditCardCategoryIds.includes(editTxnCategoryId)) return false;
    const cat = categoryById.get(editTxnCategoryId);
    return cat?.group_name === "debt";
  }, [editTxnCategoryId, categoryById, creditCardCategoryIds]);
  const editTxnNeedsCard =
    editTxnCategoryId !== "" && creditCardCategoryIds.includes(editTxnCategoryId);

  useEffect(() => {
    if (!txnNeedsCard) setTxnCardId("");
  }, [txnNeedsCard]);

  useEffect(() => {
    if (!txnNeedsDebtAccount) setTxnDebtAccountId("");
  }, [txnNeedsDebtAccount]);

  useEffect(() => {
    if (!editTxnNeedsDebtAccount) setEditTxnDebtAccountId("");
  }, [editTxnNeedsDebtAccount]);

  useEffect(() => {
    if (!editTxnNeedsCard) setEditTxnCardId("");
  }, [editTxnNeedsCard]);

  async function loadAll() {
    setMsg("");
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);

      const { data: cats, error: catErr } = await supabase
        .from("categories")
        .select("id, group_name, name, parent_id, sort_order, is_archived")
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

      const { data: debts, error: debtErr } = await supabase
        .from("debt_accounts")
        .select("id, name, balance, apr, min_payment, due_date")
        .order("name", { ascending: true });
      if (debtErr) throw debtErr;
      setDebtAccounts(
        (debts ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          balance: Number(d.balance),
          apr: d.apr === null ? null : Number(d.apr),
          min_payment: d.min_payment === null ? null : Number(d.min_payment),
          due_date: d.due_date ?? null,
        }))
      );

      const { data: plan, error: planErr } = await supabase
        .from("planned_items")
        .select("id, type, category_id, credit_card_id, name, amount")
        .eq("user_id", u.user.id)
        .eq("month", monthKey);

      if (planErr) throw planErr;

      setPlanRows(
        (plan ?? []).map((p: any) => ({
          id: p.id,
          type: p.type,
          category_id: p.category_id,
          credit_card_id: p.credit_card_id ?? null,
          name: p.name,
          amount: Number(p.amount),
        }))
      );

      const { data: t, error: txErr } = await supabase
        .from("transactions")
        .select("id, category_id, credit_card_id, debt_account_id, amount, date, name")
        .eq("user_id", u.user.id)
        .gte("date", start)
        .lt("date", end);

      if (txErr) throw txErr;

      setTxns(
        (t ?? []).map((x: any) => ({
          id: x.id,
          name: x.name ?? null,
          category_id: x.category_id ?? null,
          credit_card_id: x.credit_card_id ?? null,
          debt_account_id: x.debt_account_id ?? null,
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

  async function syncBudgetMonth() {
    if (!userId) return;
    try {
      const { data: row, error } = await supabase
        .from("budget_months")
        .select("id, user_id, month, available_start, available_end")
        .eq("user_id", userId)
        .eq("month", monthKey)
        .maybeSingle();

      if (error) throw error;

      let availableStartNext = row?.available_start;

      if (availableStartNext === undefined || availableStartNext === null) {
        const prevMonthKey = toMonthKey(addMonths(new Date(), monthOffset - 1));
        const { data: prevRow, error: prevErr } = await supabase
          .from("budget_months")
          .select("available_end")
          .eq("user_id", userId)
          .eq("month", prevMonthKey)
          .maybeSingle();
        if (prevErr) throw prevErr;
        availableStartNext = prevRow?.available_end ?? 0;
      }

      const nextEnd = availableStartNext + plannedIncome - plannedOut;

      const { data: up, error: upErr } = await supabase
        .from("budget_months")
        .upsert(
          {
            user_id: userId,
            month: monthKey,
            available_start: availableStartNext,
            available_end: nextEnd,
          },
          { onConflict: "user_id,month" }
        )
        .select("id, user_id, month, available_start, available_end")
        .single();

      if (upErr) throw upErr;

      setBudgetMonth(up as BudgetMonth);
      if (!availableDirty) {
        setAvailableStart(String(availableStartNext));
      }
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function saveAvailableStart() {
    if (!userId) return;
    setMsg("");
    setSavingAvailable(true);
    try {
      const startVal = availableStartNum;
      const nextEnd = startVal + plannedIncome - plannedOut;

      const { data: up, error } = await supabase
        .from("budget_months")
        .upsert(
          {
            user_id: userId,
            month: monthKey,
            available_start: startVal,
            available_end: nextEnd,
          },
          { onConflict: "user_id,month" }
        )
        .select("id, user_id, month, available_start, available_end")
        .single();
      if (error) throw error;

      setBudgetMonth(up as BudgetMonth);
      setAvailableDirty(false);
      setMsg("Available to budget updated.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSavingAvailable(false);
    }
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

  async function updatePlannedTotal(rowKey: string) {
    if (!userId) return;
    const target =
      rowKey.startsWith("CAT::")
        ? { kind: "category" as const, id: rowKey.slice(5) }
        : rowKey.startsWith("CC::")
        ? { kind: "card" as const, id: rowKey.slice(4) }
        : null;
    if (!target) return;

    const amt = Number(editPlannedAmount);
    if (!Number.isFinite(amt)) {
      setMsg("Enter a valid amount.");
      return;
    }

    const items =
      target.kind === "category"
        ? planRows.filter((p) => p.category_id === target.id)
        : planRows.filter(
            (p) =>
              creditCardCategoryIds.includes(p.category_id) &&
              p.credit_card_id === target.id
          );

    if (items.length > 1) {
      const ok = confirm(
        "This category has multiple planned items. Replace them with a single total?"
      );
      if (!ok) return;
    }

    let categoryId = "";
    let creditCardId: string | null = null;
    let type: PlanItem["type"] = "expense";

    if (target.kind === "category") {
      categoryId = target.id;
      const cat = categoryById.get(categoryId);
      if (!cat) {
        setMsg("Category not found.");
        return;
      }
      type =
        cat.group_name === "income"
          ? "income"
          : cat.group_name === "debt"
          ? "debt"
          : "expense";
    } else {
      if (!primaryCreditCardCategoryId) {
        setMsg('Create a Debt category containing "credit card" first.');
        return;
      }
      categoryId = primaryCreditCardCategoryId;
      creditCardId = target.id;
      type = "debt";
    }

    try {
      if (items.length === 1) {
        const { data, error } = await supabase
          .from("planned_items")
          .update({ amount: amt })
          .eq("id", items[0].id)
          .select("id, type, category_id, credit_card_id, name, amount")
          .single();
        if (error) throw error;
        setPlanRows((prev) =>
          prev.map((p) =>
            p.id === data.id
              ? { ...p, amount: Number(data.amount) }
              : p
          )
        );
      } else {
        if (items.length > 1) {
          const { error: delErr } = await supabase
            .from("planned_items")
            .delete()
            .in(
              "id",
              items.map((p) => p.id)
            );
          if (delErr) throw delErr;
          setPlanRows((prev) => prev.filter((p) => !items.some((x) => x.id === p.id)));
        }

        const payload: any = {
          user_id: userId,
          month: monthKey,
          type,
          category_id: categoryId,
          credit_card_id: creditCardId,
          name: "Planned total",
          amount: amt,
        };
        const { data, error } = await supabase
          .from("planned_items")
          .insert([payload])
          .select("id, type, category_id, credit_card_id, name, amount")
          .single();
        if (error) throw error;
        setPlanRows((prev) => [
          ...prev,
          {
            id: data.id,
            type: data.type,
            category_id: data.category_id,
            credit_card_id: data.credit_card_id ?? null,
            name: data.name,
            amount: Number(data.amount),
          },
        ]);
      }

      setEditPlannedKey(null);
      setEditPlannedAmount("");
      setMsg("Planned total updated.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  function startEditPlanned(rowId: string, planned: number) {
    setEditPlannedKey(rowId);
    setEditPlannedAmount(String(planned));
  }

  function cancelEditPlanned() {
    setEditPlannedKey(null);
    setEditPlannedAmount("");
  }


  async function addCategoryForGroup(group: Category["group_name"]) {
    if (!userId) return;
    setMsg("");
    try {
      const name = newCatName[group].trim();
      if (!name) throw new Error("Enter a category name.");

      const parentId = newCatParent[group] ? newCatParent[group] : null;
      if (parentId) {
        const p = categoryById.get(parentId);
        if (!p) throw new Error("Parent not found.");
        if (p.group_name !== group) throw new Error("Parent must be in the same group.");
        if (p.parent_id) throw new Error("Parent cannot have a parent.");
      }

      const maxOrder = categories
        .filter(
          (c) =>
            c.group_name === group && (c.parent_id ?? null) === (parentId ?? null)
        )
        .reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);

      const { data, error } = await supabase
        .from("categories")
        .insert([
          {
            user_id: userId,
            group_name: group,
            name,
            parent_id: parentId,
            sort_order: maxOrder + 1,
          },
        ])
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .single();
      if (error) throw error;

      setCategories((prev) =>
        [...prev, data as Category].sort((a, b) => {
          if (a.group_name !== b.group_name) return a.group_name.localeCompare(b.group_name);
          if ((a.parent_id ?? "") !== (b.parent_id ?? ""))
            return (a.parent_id ?? "").localeCompare(b.parent_id ?? "");
          return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
        })
      );

      setNewCatName((prev) => ({ ...prev, [group]: "" }));
      setNewCatParent((prev) => ({ ...prev, [group]: "" }));
      setMsg(`Added "${name}".`);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function onDropCategory(targetCategoryId: string) {
    if (!dragCategoryId || dragCategoryId === targetCategoryId) return;

    const dragged = categoryById.get(dragCategoryId);
    const target = categoryById.get(targetCategoryId);
    if (!dragged || !target) return;

    if (
      dragged.group_name !== target.group_name ||
      (dragged.parent_id ?? null) !== (target.parent_id ?? null)
    ) {
      return;
    }

    const siblings = categories
      .filter(
        (c) =>
          c.group_name === dragged.group_name &&
          (c.parent_id ?? null) === (dragged.parent_id ?? null)
      )
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    const fromIndex = siblings.findIndex((c) => c.id === dragged.id);
    const toIndex = siblings.findIndex((c) => c.id === target.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = siblings.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    const updates = await Promise.all(
      next.map((c, i) =>
        supabase.from("categories").update({ sort_order: i + 1 }).eq("id", c.id)
      )
    );
    const err = updates.find((r) => r.error)?.error;
    if (err) {
      setMsg(err.message);
      return;
    }

    const orderMap = new Map<string, number>();
    next.forEach((c, i) => orderMap.set(c.id, i + 1));
    setCategories((prev) =>
      prev.map((c) =>
        orderMap.has(c.id) ? { ...c, sort_order: orderMap.get(c.id)! } : c
      )
    );
    setDragCategoryId(null);
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
      const cardName = card?.name ?? "Credit Card";
      return `Credit Card Payment - ${cardName}`;
    }

    if (cat?.group_name === "debt") {
      const debt = debtId ? debtById.get(debtId) : null;
      const debtName = debt?.name ?? "Debt";
      return `Debt Payment - ${debtName}`;
    }

    return catName;
  }

  async function addTxn() {
    setMsg("");
    try {
      if (!userId) return;
      const amt = Number(txnAmount);
      if (!txnDate) throw new Error("Pick a date.");
      if (!Number.isFinite(amt)) throw new Error("Enter a valid amount.");
      if (!txnCategoryId) throw new Error("Pick a category.");
      if (txnNeedsCard && !txnCardId) throw new Error("Select a credit card.");
      if (txnNeedsDebtAccount && !txnDebtAccountId) throw new Error("Select a debt account.");

      const computedName = fallbackTxnName(
        txnCategoryId,
        txnNeedsCard ? txnCardId : null,
        txnDescription,
        txnNeedsDebtAccount ? txnDebtAccountId : null
      );

      const payload: any = {
        user_id: userId,
        source: "manual",
        date: txnDate,
        name: computedName,
        amount: amt,
        category_id: txnCategoryId,
        is_pending: false,
        credit_card_id: txnNeedsCard ? txnCardId : null,
        debt_account_id: txnNeedsDebtAccount ? txnDebtAccountId : null,
      };

      const { error } = await supabase.from("transactions").insert([payload]);
      if (error) throw error;

      if (txnNeedsDebtAccount && txnDebtAccountId) {
        await adjustDebtBalance(txnDebtAccountId, -amt);
      }

      setTxnAmount("");
      setTxnDebtAccountId("");
      setTxnDescription("");
      setMsg("Transaction saved.");
      await loadAll();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  function startEditTxn(t: Txn) {
    setEditTxnId(t.id);
    setEditTxnDate(t.date);
    setEditTxnAmount(String(t.amount));
    setEditTxnCategoryId(t.category_id ?? "");
    setEditTxnCardId(t.credit_card_id ?? "");
    setEditTxnDebtAccountId(t.debt_account_id ?? "");
    setEditTxnDescription(t.name ?? "");
  }

  function cancelEditTxn() {
    setEditTxnId(null);
    setEditTxnDate("");
    setEditTxnAmount("");
    setEditTxnCategoryId("");
    setEditTxnCardId("");
    setEditTxnDebtAccountId("");
    setEditTxnDescription("");
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

  async function adjustDebtBalance(debtId: string, delta: number) {
    const debt = debtAccounts.find((d) => d.id === debtId);
    if (!debt) throw new Error("Debt account not found.");
    const next = debt.balance + delta;
    const { error } = await supabase
      .from("debt_accounts")
      .update({ balance: next })
      .eq("id", debtId);
    if (error) throw error;
    setDebtAccounts((prev) =>
      prev.map((d) => (d.id === debtId ? { ...d, balance: next } : d))
    );
  }

  async function saveEditTxn(t: Txn) {
    setMsg("");
    try {
      if (!userId) return;
      const amt = Number(editTxnAmount);
      if (!editTxnDate) throw new Error("Pick a date.");
      if (!Number.isFinite(amt)) throw new Error("Enter a valid amount.");
      if (!editTxnCategoryId) throw new Error("Pick a category.");
      if (editTxnNeedsCard && !editTxnCardId) throw new Error("Select a credit card.");
      if (editTxnNeedsDebtAccount && !editTxnDebtAccountId)
        throw new Error("Select a debt account.");

      const newName = fallbackTxnName(
        editTxnCategoryId,
        editTxnNeedsCard ? editTxnCardId : null,
        editTxnDescription,
        editTxnNeedsDebtAccount ? editTxnDebtAccountId : null
      );

      const payload: any = {
        date: editTxnDate,
        name: newName,
        amount: amt,
        category_id: editTxnCategoryId,
        credit_card_id: editTxnNeedsCard ? editTxnCardId : null,
        debt_account_id: editTxnNeedsDebtAccount ? editTxnDebtAccountId : null,
      };

      const oldRequiresCard =
        !!t.category_id && creditCardCategoryIds.includes(t.category_id);
      const newRequiresCard = editTxnNeedsCard;

      const oldCardId = t.credit_card_id ?? null;
      const newCardId = editTxnNeedsCard ? editTxnCardId : null;

      const oldRequiresDebt =
        !!t.category_id &&
        !creditCardCategoryIds.includes(t.category_id) &&
        categoryById.get(t.category_id)?.group_name === "debt";
      const newRequiresDebt = editTxnNeedsDebtAccount;

      const oldDebtId = t.debt_account_id ?? null;
      const newDebtId = editTxnNeedsDebtAccount ? editTxnDebtAccountId : null;

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

      if (oldRequiresDebt && newRequiresDebt && oldDebtId && newDebtId) {
        if (oldDebtId === newDebtId) {
          const delta = t.amount - amt;
          if (delta !== 0) await adjustDebtBalance(oldDebtId, delta);
        } else {
          await adjustDebtBalance(oldDebtId, t.amount);
          await adjustDebtBalance(newDebtId, -amt);
        }
      } else if (oldRequiresDebt && oldDebtId) {
        await adjustDebtBalance(oldDebtId, t.amount);
      } else if (newRequiresDebt && newDebtId) {
        await adjustDebtBalance(newDebtId, -amt);
      }

      setTxns((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? {
                ...x,
                date: editTxnDate,
                name: newName,
                amount: amt,
                category_id: editTxnCategoryId,
                credit_card_id: editTxnNeedsCard ? editTxnCardId : null,
                debt_account_id: editTxnNeedsDebtAccount ? editTxnDebtAccountId : null,
              }
            : x
        )
      );

      cancelEditTxn();
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

      const oldRequiresDebt =
        !!t.category_id &&
        !creditCardCategoryIds.includes(t.category_id) &&
        categoryById.get(t.category_id)?.group_name === "debt";
      const oldDebtId = t.debt_account_id ?? null;

      const { error } = await supabase.from("transactions").delete().eq("id", t.id);
      if (error) throw error;

      if (oldRequiresCard && oldCardId) {
        await adjustCardBalance(oldCardId, t.amount);
      }

      if (oldRequiresDebt && oldDebtId) {
        await adjustDebtBalance(oldDebtId, t.amount);
      }

      setTxns((prev) => prev.filter((x) => x.id !== t.id));
      setMsg("Transaction deleted.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  const availableStartNum = useMemo(() => {
    const n = Number(availableStart);
    return Number.isFinite(n) ? n : 0;
  }, [availableStart]);

  const availableEnd = useMemo(() => {
    return availableStartNum + plannedIncome - plannedOut;
  }, [availableStartNum, plannedIncome, plannedOut]);

  useEffect(() => {
    syncBudgetMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, monthKey, plannedIncome, plannedOut]);

  // Sections
  const incomeCats = categories.filter((c) => c.group_name === "income");
  const expenseCats = categories.filter((c) => c.group_name === "expense");
  const debtCats = categories.filter((c) => c.group_name === "debt");
  const miscCats = categories.filter((c) => c.group_name === "misc");

  function childrenByParentFor(list: Category[]) {
    const map = new Map<string, Category[]>();
    for (const c of list) {
      if (!c.parent_id) continue;
      if (!map.has(c.parent_id)) map.set(c.parent_id, []);
      map.get(c.parent_id)!.push(c);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
      map.set(k, arr);
    }
    return map;
  }

  function buildCategoryRows(list: Category[]) {
    const childrenByParent = childrenByParentFor(list);
    const parents = list
      .filter((c) => c.parent_id === null)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    const rows: Array<{
      id: string;
      label: string;
      planned: number;
      actual: number;
      remaining: number;
      editable?: boolean;
      indent?: number;
      orderableCategoryId?: string;
    }> = [];

    for (const p of parents) {
      const kids = childrenByParent.get(p.id) ?? [];
      if (kids.length > 0) {
        const totals = kids.reduce(
          (acc, k) => {
            const v = rowForCategory(k.id);
            acc.planned += v.planned;
            acc.actual += v.actual;
            acc.remaining += v.remaining;
            return acc;
          },
          { planned: 0, actual: 0, remaining: 0 }
        );
        rows.push({
          id: `PARENT::${p.id}`,
          label: p.name,
          planned: totals.planned,
          actual: totals.actual,
          remaining: totals.remaining,
          editable: false,
          indent: 0,
          orderableCategoryId: p.id,
        });
        for (const k of kids) {
          const v = rowForCategory(k.id);
          rows.push({
            id: `CAT::${k.id}`,
            label: k.name,
            planned: v.planned,
            actual: v.actual,
            remaining: v.remaining,
            editable: true,
            indent: 1,
            orderableCategoryId: k.id,
          });
        }
      } else {
        const v = rowForCategory(p.id);
        rows.push({
          id: `CAT::${p.id}`,
          label: p.name,
          planned: v.planned,
          actual: v.actual,
          remaining: v.remaining,
          editable: true,
          indent: 0,
          orderableCategoryId: p.id,
        });
      }
    }

    return rows;
  }

  function buildCategoryGroups(list: Category[]) {
    const childrenByParent = childrenByParentFor(list);
    const parents = list
      .filter((c) => c.parent_id === null)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    return parents.map((p) => {
      const kids = childrenByParent.get(p.id) ?? [];
      if (kids.length > 0) {
        const totals = kids.reduce(
          (acc, k) => {
            const v = rowForCategory(k.id);
            acc.planned += v.planned;
            acc.actual += v.actual;
            acc.remaining += v.remaining;
            return acc;
          },
          { planned: 0, actual: 0, remaining: 0 }
        );
        const rows: BudgetRow[] = kids.map((k) => {
          const v = rowForCategory(k.id);
          return {
            id: `CAT::${k.id}`,
            label: k.name,
            planned: v.planned,
            actual: v.actual,
            remaining: v.remaining,
            editable: true,
            indent: 0,
            orderableCategoryId: k.id,
          };
        });
        return {
          id: `PARENT::${p.id}`,
          label: p.name,
          totals,
          rows,
        };
      }

      const v = rowForCategory(p.id);
      return {
        id: `CAT::${p.id}`,
        label: p.name,
        totals: v,
        rows: [
          {
            id: `CAT::${p.id}`,
            label: p.name,
            planned: v.planned,
            actual: v.actual,
            remaining: v.remaining,
            editable: true,
            indent: 0,
            orderableCategoryId: p.id,
          },
        ],
      };
    });
  }

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

  // Build section rows
  const incomeRows = buildCategoryRows(incomeCats);
  const expenseGroups = buildCategoryGroups(expenseCats);

  // Debt:
  // - per-card credit card payments (bucketed from ANY "credit card*" debt category)
  // - other debt categories shown normally, excluding the "credit card*" categories to avoid double-counting
  const debtRows = [
    ...cards.map((cc) => {
      const v = cardRow(cc.id);
      return {
        id: `CC::${cc.id}`,
        label: `Credit Card Payment - ${cc.name}`,
        extra: `Current balance: $${cc.current_balance.toFixed(2)}`,
        ...v,
      };
    }),
    ...buildCategoryRows(
      debtCats.filter((c) => !creditCardCategoryIds.includes(c.id))
    ),
  ];

  const miscRows = buildCategoryRows(miscCats);

  const ccCategoryLabel = useMemo(() => {
    if (creditCardCategoryIds.length === 0) return "";
    // show the first matching category name for reference
    const c = categories.find((x) => x.id === primaryCreditCardCategoryId);
    return c?.name ?? "";
  }, [creditCardCategoryIds.length, categories, primaryCreditCardCategoryId]);

  return (
    <AuthGate>
      <main className="mx-auto mt-10 max-w-6xl px-4">
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
              {loading ? "Refreshing..." : "Refresh"}
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
                  {start} {"->"} {end}
                </span>
              </div>
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">counts:</span>{" "}
                categories={categories.length}, cards={cards.length}, planned={planRows.length},
                txns={txns.length}
              </div>
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">totals:</span>{" "}
                plannedIncome={formatMoney(plannedIncome)}, plannedOut={formatMoney(plannedOut)},
                plannedNet={formatMoney(plannedNet)} | actualIncome={formatMoney(actualIncome)},
                actualOut={formatMoney(actualOut)}, actualNet={formatMoney(actualNet)}
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

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            {/* Top summary */}
            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="text-sm text-zinc-700 dark:text-zinc-300">
                  Available to budget
                </div>
                <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                  Rollover start:
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    value={availableStart}
                    onChange={(e) => {
                      setAvailableStart(e.target.value);
                      setAvailableDirty(true);
                    }}
                    inputMode="decimal"
                    className="w-[140px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    placeholder="0"
                  />
                  <button
                    onClick={saveAvailableStart}
                    disabled={savingAvailable || !availableDirty}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    {savingAvailable ? "Saving..." : "Save"}
                  </button>
                </div>
                <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                  End of month:{" "}
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatMoney(availableEnd)}
                  </span>
                </div>
                {budgetMonth && (
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    Month key: {budgetMonth.month}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="text-sm text-zinc-700 dark:text-zinc-300">Planned</div>
                <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                  Income:{" "}
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatMoney(plannedIncome)}
                  </span>
                </div>
                <div className="text-sm text-zinc-700 dark:text-zinc-300">
                  Outflow:{" "}
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatMoney(plannedOut)}
                  </span>
                </div>
                <div className="text-sm text-zinc-700 dark:text-zinc-300">
                  Net:{" "}
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatMoney(plannedNet)}
                  </span>
                </div>
              </div>
            </section>

            <Section
              title="Income"
              header={
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    value={newCatName.income}
                    onChange={(e) =>
                      setNewCatName((prev) => ({ ...prev, income: e.target.value }))
                    }
                    placeholder="Add income category"
                    className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <select
                    value={newCatParent.income}
                    onChange={(e) =>
                      setNewCatParent((prev) => ({ ...prev, income: e.target.value }))
                    }
                    className="min-w-[160px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">No parent</option>
                    {incomeCats
                      .filter((c) => c.parent_id === null)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => addCategoryForGroup("income")}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Add
                  </button>
                </div>
              }
            >
              <BudgetTable
                rows={incomeRows}
                onDrop={onDropCategory}
                editPlannedKey={editPlannedKey}
                editPlannedAmount={editPlannedAmount}
                setEditPlannedAmount={setEditPlannedAmount}
                onSavePlanned={updatePlannedTotal}
                onCancelPlanned={cancelEditPlanned}
                onStartEditPlanned={startEditPlanned}
                setDragCategoryId={setDragCategoryId}
              />
            </Section>

            <Section
              title="Expenses"
              header={
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    value={newCatName.expense}
                    onChange={(e) =>
                      setNewCatName((prev) => ({ ...prev, expense: e.target.value }))
                    }
                    placeholder="Add expense category"
                    className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <select
                    value={newCatParent.expense}
                    onChange={(e) =>
                      setNewCatParent((prev) => ({ ...prev, expense: e.target.value }))
                    }
                    className="min-w-[160px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">No parent</option>
                    {expenseCats
                      .filter((c) => c.parent_id === null)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => addCategoryForGroup("expense")}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Add
                  </button>
                </div>
              }
            >
              <div className="grid gap-4">
                {expenseGroups.map((group) => (
                  <div
                    key={group.id}
                    className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {group.label}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">
                        Planned {formatMoney(group.totals.planned)} • Actual{" "}
                        {formatMoney(group.totals.actual)} • Remaining{" "}
                        {formatMoney(group.totals.remaining)}
                      </div>
                    </div>
                    <div className="mt-3">
                      <BudgetTable
                        rows={group.rows}
                        onDrop={onDropCategory}
                        editPlannedKey={editPlannedKey}
                        editPlannedAmount={editPlannedAmount}
                        setEditPlannedAmount={setEditPlannedAmount}
                        onSavePlanned={updatePlannedTotal}
                        onCancelPlanned={cancelEditPlanned}
                        onStartEditPlanned={startEditPlanned}
                        setDragCategoryId={setDragCategoryId}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title="Debt"
              header={
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    value={newCatName.debt}
                    onChange={(e) =>
                      setNewCatName((prev) => ({ ...prev, debt: e.target.value }))
                    }
                    placeholder="Add debt category"
                    className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <select
                    value={newCatParent.debt}
                    onChange={(e) =>
                      setNewCatParent((prev) => ({ ...prev, debt: e.target.value }))
                    }
                    className="min-w-[160px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">No parent</option>
                    {debtCats
                      .filter((c) => c.parent_id === null)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => addCategoryForGroup("debt")}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Add
                  </button>
                </div>
              }
            >
              <BudgetTable
                rows={debtRows}
                onDrop={onDropCategory}
                editPlannedKey={editPlannedKey}
                editPlannedAmount={editPlannedAmount}
                setEditPlannedAmount={setEditPlannedAmount}
                onSavePlanned={updatePlannedTotal}
                onCancelPlanned={cancelEditPlanned}
                onStartEditPlanned={startEditPlanned}
                setDragCategoryId={setDragCategoryId}
              />
              <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                Credit card payments are shown per card. We treat any Debt category containing{" "}
                <span className="font-semibold">"credit card"</span> as a credit card payment bucket.
                {ccCategoryLabel ? (
                  <>
                    {" "}
                    Your current category is:{" "}
                    <span className="font-semibold">{ccCategoryLabel}</span>.
                  </>
                ) : (
                  <>
                    {" "}
                    Create a Debt category named "Credit Card" or "Credit Card Payment".
                  </>
                )}
              </div>
            </Section>

            <Section
              title="Misc"
              header={
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    value={newCatName.misc}
                    onChange={(e) =>
                      setNewCatName((prev) => ({ ...prev, misc: e.target.value }))
                    }
                    placeholder="Add misc category"
                    className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <select
                    value={newCatParent.misc}
                    onChange={(e) =>
                      setNewCatParent((prev) => ({ ...prev, misc: e.target.value }))
                    }
                    className="min-w-[160px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">No parent</option>
                    {miscCats
                      .filter((c) => c.parent_id === null)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => addCategoryForGroup("misc")}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Add
                  </button>
                </div>
              }
            >
              <BudgetTable
                rows={miscRows}
                onDrop={onDropCategory}
                editPlannedKey={editPlannedKey}
                editPlannedAmount={editPlannedAmount}
                setEditPlannedAmount={setEditPlannedAmount}
                onSavePlanned={updatePlannedTotal}
                onCancelPlanned={cancelEditPlanned}
                onStartEditPlanned={startEditPlanned}
                setDragCategoryId={setDragCategoryId}
              />
            </Section>


            <section className="mt-8">
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Item</th>
                      <th className="p-3 text-left">Category</th>
                      <th className="p-3 text-left">Account</th>
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
                        const debt = t.debt_account_id ? debtById.get(t.debt_account_id) : null;
                        const isEditing = editTxnId === t.id;
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
                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  type="date"
                                  value={editTxnDate}
                                  onChange={(e) => setEditTxnDate(e.target.value)}
                                  className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                />
                              ) : (
                                t.date
                              )}
                            </td>
                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  value={editTxnDescription}
                                  onChange={(e) => setEditTxnDescription(e.target.value)}
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
                                  value={editTxnCategoryId}
                                  onChange={(e) => setEditTxnCategoryId(e.target.value)}
                                  className="min-w-[200px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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
                              ) : cat ? (
                                `${cat.group_name} - ${cat.name}`
                              ) : (
                                "--"
                              )}
                            </td>
                            <td className="p-3">
                              {isEditing ? (
                                editTxnNeedsCard ? (
                                  <select
                                    value={editTxnCardId}
                                    onChange={(e) => setEditTxnCardId(e.target.value)}
                                    className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                  >
                                    <option value="">Select a card</option>
                                    {cards.map((cc) => (
                                      <option key={cc.id} value={cc.id}>
                                        {cc.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : editTxnNeedsDebtAccount ? (
                                  <select
                                    value={editTxnDebtAccountId}
                                    onChange={(e) => setEditTxnDebtAccountId(e.target.value)}
                                    className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                  >
                                    <option value="">Select a debt account</option>
                                    {debtAccounts.map((d) => (
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
                                  value={editTxnAmount}
                                  onChange={(e) => setEditTxnAmount(e.target.value)}
                                  inputMode="decimal"
                                  className="w-[120px] rounded-md border border-zinc-300 bg-white p-2 text-right text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                />
                              ) : (
                                formatMoney(t.amount)
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => saveEditTxn(t)}
                                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditTxn}
                                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => startEditTxn(t)}
                                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => deleteTxn(t)}
                                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                                  >
                                    Delete
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
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold">Add transaction</h2>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Date</span>
                  <input
                    type="date"
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Category</span>
                  <select
                    value={txnCategoryId}
                    onChange={(e) => setTxnCategoryId(e.target.value)}
                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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

                {txnNeedsCard && (
                  <label className="grid gap-1">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">Card</span>
                    <select
                      value={txnCardId}
                      onChange={(e) => setTxnCardId(e.target.value)}
                      className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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

                {txnNeedsDebtAccount && (
                  <label className="grid gap-1">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">Debt account</span>
                    <select
                      value={txnDebtAccountId}
                      onChange={(e) => setTxnDebtAccountId(e.target.value)}
                      className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      <option value="">Select a debt account</option>
                      {debtAccounts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Amount</span>
                  <input
                    value={txnAmount}
                    onChange={(e) => setTxnAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="85.25"
                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    Description (optional)
                  </span>
                  <input
                    value={txnDescription}
                    onChange={(e) => setTxnDescription(e.target.value)}
                    placeholder="Target, Venmo, notes..."
                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <button
                  onClick={addTxn}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold">Debt accounts</h2>
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Name</span>
                  <input
                    value={debtName}
                    onChange={(e) => setDebtName(e.target.value)}
                    placeholder="Car loan, Student loan..."
                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Balance</span>
                  <input
                    value={debtBalance}
                    onChange={(e) => setDebtBalance(e.target.value)}
                    inputMode="decimal"
                    placeholder="12000"
                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">APR</span>
                  <input
                    value={debtApr}
                    onChange={(e) => setDebtApr(e.target.value)}
                    inputMode="decimal"
                    placeholder="5.25"
                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Min payment</span>
                  <input
                    value={debtMinPayment}
                    onChange={(e) => setDebtMinPayment(e.target.value)}
                    inputMode="decimal"
                    placeholder="125"
                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Due date</span>
                  <input
                    type="date"
                    value={debtDueDate}
                    onChange={(e) => setDebtDueDate(e.target.value)}
                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <button
                  onClick={async () => {
                    setMsg("");
                    try {
                      if (!userId) return;
                      const name = debtName.trim();
                      if (!name) throw new Error("Enter a debt name.");
                      const bal = Number(debtBalance);
                      const apr = debtApr.trim() === "" ? null : Number(debtApr);
                      const minPay = debtMinPayment.trim() === "" ? null : Number(debtMinPayment);
                      if (!Number.isFinite(bal)) throw new Error("Balance must be a number.");
                      if (apr !== null && !Number.isFinite(apr)) throw new Error("APR must be a number.");
                      if (minPay !== null && !Number.isFinite(minPay)) throw new Error("Min payment must be a number.");

                      const { data, error } = await supabase
                        .from("debt_accounts")
                        .insert([
                          {
                            user_id: userId,
                            name,
                            balance: bal,
                            apr,
                            min_payment: minPay,
                            due_date: debtDueDate || null,
                          },
                        ])
                        .select("id, name, balance, apr, min_payment, due_date")
                        .single();
                      if (error) throw error;

                      setDebtAccounts((prev) => [
                        ...prev,
                        {
                          id: data.id,
                          name: data.name,
                          balance: Number(data.balance),
                          apr: data.apr === null ? null : Number(data.apr),
                          min_payment: data.min_payment === null ? null : Number(data.min_payment),
                          due_date: data.due_date ?? null,
                        },
                      ]);
                      setDebtName("");
                      setDebtBalance("");
                      setDebtApr("");
                      setDebtMinPayment("");
                      setDebtDueDate("");
                      setMsg("Debt account added.");
                    } catch (e: any) {
                      setMsg(e?.message ?? String(e));
                    }
                  }}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  Add debt
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {debtAccounts.length === 0 ? (
                  <div className="text-sm text-zinc-600 dark:text-zinc-300">
                    No debt accounts yet.
                  </div>
                ) : (
                  debtAccounts.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {d.name}
                      </div>
                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Balance {formatMoney(d.balance)} • APR{" "}
                        {d.apr === null ? "--" : `${d.apr}%`} • Min{" "}
                        {d.min_payment === null ? "--" : formatMoney(d.min_payment)} • Due{" "}
                        {d.due_date ?? "--"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-sm text-zinc-700 dark:text-zinc-300">Actual</div>
              <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                Income:{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatMoney(actualIncome)}
                </span>
              </div>
              <div className="text-sm text-zinc-700 dark:text-zinc-300">
                Outflow:{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatMoney(actualOut)}
                </span>
              </div>
              <div className="text-sm text-zinc-700 dark:text-zinc-300">
                Net:{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatMoney(actualNet)}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-sm text-zinc-700 dark:text-zinc-300">Debt insight</div>
              <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                Total card balance:{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatMoney(
                    cards.reduce((s, c) => s + Number(c.current_balance), 0)
                  )}
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Payments this month: {formatMoney(
                  txns
                    .filter((t) => t.category_id && creditCardCategoryIds.includes(t.category_id))
                    .reduce((s, t) => s + t.amount, 0)
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </AuthGate>
  );
}
