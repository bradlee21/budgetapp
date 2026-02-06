"use client";

import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { formatMoney } from "@/lib/format";
import { useEffect, useRef, useState, type ReactNode } from "react";

type DebtAccount = {
  id: string;
  name: string;
  debt_type: "credit_card" | "loan" | "mortgage" | "student_loan" | "other";
  balance: number;
  apr: number | null;
  min_payment: number | null;
  due_date: string | null;
};

function debtTypeLabel(value: DebtAccount["debt_type"]) {
  switch (value) {
    case "credit_card":
      return "Credit card";
    case "loan":
      return "Loan";
    case "mortgage":
      return "Mortgage";
    case "student_loan":
      return "Student loan";
    default:
      return "Other";
  }
}

function validateDateInput(value: string, options: { allowEmpty?: boolean } = {}) {
  if (!value) {
    return options.allowEmpty ? "" : "Date is required.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "Use a valid date.";
  }
  const [y, m, d] = value.split("-").map(Number);
  if (y < 2000 || y > 2100) return "Year must be between 2000 and 2100.";
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return "Use a valid date.";
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) {
    return "Use a real date.";
  }
  return "";
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

export default function DebtAccountsPage() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [debtAccounts, setDebtAccounts] = useState<DebtAccount[]>([]);
  const addFormRef = useRef<HTMLDivElement | null>(null);
  const addNameRef = useRef<HTMLInputElement | null>(null);

  const [debtType, setDebtType] = useState<DebtAccount["debt_type"]>("credit_card");
  const [debtName, setDebtName] = useState("");
  const [debtBalance, setDebtBalance] = useState("");
  const [debtApr, setDebtApr] = useState("");
  const [debtMinPayment, setDebtMinPayment] = useState("");
  const [debtDueDate, setDebtDueDate] = useState("");
  const [debtDueDateError, setDebtDueDateError] = useState("");

  const [editDebtId, setEditDebtId] = useState<string | null>(null);
  const [editDebtType, setEditDebtType] = useState<DebtAccount["debt_type"]>("credit_card");
  const [editDebtName, setEditDebtName] = useState("");
  const [editDebtBalance, setEditDebtBalance] = useState("");
  const [editDebtApr, setEditDebtApr] = useState("");
  const [editDebtMinPayment, setEditDebtMinPayment] = useState("");
  const [editDebtDueDate, setEditDebtDueDate] = useState("");
  const [editDebtDueDateError, setEditDebtDueDateError] = useState("");

  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "",
    body: "",
  });
  const confirmActionRef = useRef<null | (() => Promise<void>)>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        setUserId(u.user.id);
        const { data, error } = await supabase
          .from("debt_accounts")
          .select("id, name, debt_type, balance, apr, min_payment, due_date")
          .order("name", { ascending: true });
        if (error) throw error;
        setDebtAccounts(
          (data ?? []).map((d: any) => ({
            id: d.id,
            name: d.name,
            debt_type: (d.debt_type ?? "credit_card") as DebtAccount["debt_type"],
            balance: Number(d.balance),
            apr: d.apr === null ? null : Number(d.apr),
            min_payment: d.min_payment === null ? null : Number(d.min_payment),
            due_date: d.due_date ?? null,
          }))
        );
      } catch (e: any) {
        setMsg(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function startEditDebt(d: DebtAccount) {
    setEditDebtId(d.id);
    setEditDebtName(d.name);
    setEditDebtType(d.debt_type);
    setEditDebtBalance(String(d.balance));
    setEditDebtApr(d.apr === null ? "" : String(d.apr));
    setEditDebtMinPayment(d.min_payment === null ? "" : String(d.min_payment));
    setEditDebtDueDate(d.due_date ?? "");
    setEditDebtDueDateError("");
  }

  function cancelEditDebt() {
    setEditDebtId(null);
    setEditDebtName("");
    setEditDebtBalance("");
    setEditDebtApr("");
    setEditDebtMinPayment("");
    setEditDebtDueDate("");
    setEditDebtDueDateError("");
  }

  async function saveEditDebt() {
    if (!editDebtId) return;
    setMsg("");
    try {
      const name = editDebtName.trim();
      if (!name) throw new Error("Enter a debt name.");
      const bal = Number(editDebtBalance);
      const apr = editDebtApr.trim() === "" ? null : Number(editDebtApr);
      const minPay = editDebtMinPayment.trim() === "" ? null : Number(editDebtMinPayment);
      if (!Number.isFinite(bal)) throw new Error("Balance must be a number.");
      if (apr !== null && !Number.isFinite(apr)) throw new Error("APR must be a number.");
      if (minPay !== null && !Number.isFinite(minPay))
        throw new Error("Min payment must be a number.");
      const dueErr = validateDateInput(editDebtDueDate, { allowEmpty: true });
      setEditDebtDueDateError(dueErr);
      if (dueErr) throw new Error(dueErr);

      const { data, error } = await supabase
        .from("debt_accounts")
        .update({
          name,
          debt_type: editDebtType,
          balance: bal,
          apr,
          min_payment: minPay,
          due_date: editDebtDueDate || null,
        })
        .eq("id", editDebtId)
        .select("id, name, debt_type, balance, apr, min_payment, due_date")
        .single();
      if (error) throw error;

      setDebtAccounts((prev) =>
        prev.map((d) =>
          d.id === editDebtId
            ? {
                id: data.id,
                name: data.name,
                debt_type: (data.debt_type ?? "credit_card") as DebtAccount["debt_type"],
                balance: Number(data.balance),
                apr: data.apr === null ? null : Number(data.apr),
                min_payment: data.min_payment === null ? null : Number(data.min_payment),
                due_date: data.due_date ?? null,
              }
            : d
        )
      );
      cancelEditDebt();
      setMsg("Debt account updated.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function addDebtAccount() {
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
      if (minPay !== null && !Number.isFinite(minPay))
        throw new Error("Min payment must be a number.");
      const dueErr = validateDateInput(debtDueDate, { allowEmpty: true });
      setDebtDueDateError(dueErr);
      if (dueErr) throw new Error(dueErr);

      const { data, error } = await supabase
        .from("debt_accounts")
        .insert([
          {
            user_id: userId,
            name,
            debt_type: debtType,
            balance: bal,
            apr,
            min_payment: minPay,
            due_date: debtDueDate || null,
          },
        ])
        .select("id, name, debt_type, balance, apr, min_payment, due_date")
        .single();
      if (error) throw error;

      setDebtAccounts((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          debt_type: (data.debt_type ?? "credit_card") as DebtAccount["debt_type"],
          balance: Number(data.balance),
          apr: data.apr === null ? null : Number(data.apr),
          min_payment: data.min_payment === null ? null : Number(data.min_payment),
          due_date: data.due_date ?? null,
        },
      ]);
      setDebtName("");
      setDebtType("credit_card");
      setDebtBalance("");
      setDebtApr("");
      setDebtMinPayment("");
      setDebtDueDate("");
      setDebtDueDateError("");
      setMsg("Debt account added.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function deleteDebtAccount(d: DebtAccount) {
    confirmActionRef.current = async () => {
      const { error } = await supabase.from("debt_accounts").delete().eq("id", d.id);
      if (error) throw error;
      setDebtAccounts((prev) => prev.filter((x) => x.id !== d.id));
      setMsg("Debt account deleted.");
    };
    setConfirmState({
      open: true,
      title: "Delete debt account?",
      body: "Transactions will remain but no longer be linked.",
    });
  }

  async function handleConfirm() {
    const fn = confirmActionRef.current;
    confirmActionRef.current = null;
    setConfirmState({ open: false, title: "", body: "" });
    if (!fn) return;
    try {
      await fn();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  function focusAddDebt() {
    if (addFormRef.current) {
      addFormRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setTimeout(() => {
      addNameRef.current?.focus();
    }, 200);
  }

  return (
    <AuthGate>
      <main className="mx-auto mt-8 w-full max-w-4xl overflow-x-hidden px-4 sm:mt-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Debt accounts</h1>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Track balances, minimums, and due dates.
            </div>
          </div>
        </div>

        {msg && (
          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {msg}
          </div>
        )}

        {confirmState.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {confirmState.title}
              </div>
              <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                {confirmState.body}
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    confirmActionRef.current = null;
                    setConfirmState({ open: false, title: "", body: "" });
                  }}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="rounded-md border border-red-300 bg-white px-3 py-2 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-zinc-950 dark:text-red-200 dark:hover:bg-red-950"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        <section
          ref={addFormRef}
          className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add debt</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Type</span>
              <select
                value={debtType}
                onChange={(e) => setDebtType(e.target.value as DebtAccount["debt_type"])}
                className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="credit_card">Credit card</option>
                <option value="loan">Loan</option>
                <option value="mortgage">Mortgage</option>
                <option value="student_loan">Student loan</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Name</span>
              <input
                ref={addNameRef}
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
                min="2000-01-01"
                max="2100-12-31"
                onChange={(e) => {
                  if (e.target.value.length > 10) return;
                  setDebtDueDate(e.target.value);
                  if (debtDueDateError) setDebtDueDateError("");
                }}
                onBlur={() =>
                  setDebtDueDateError(validateDateInput(debtDueDate, { allowEmpty: true }))
                }
                className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              {debtDueDateError && (
                <div className="text-xs text-red-600 dark:text-red-400">
                  {debtDueDateError}
                </div>
              )}
            </label>
          </div>
          <button
            onClick={addDebtAccount}
            disabled={loading}
            className="mt-3 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Add debt
          </button>
        </section>

        <section className="mt-6 space-y-3">
          {debtAccounts.length === 0 ? (
            <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <div>No debt accounts yet.</div>
              <button
                onClick={focusAddDebt}
                className="mt-2 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                Add debt
              </button>
            </div>
          ) : (
            debtAccounts.map((d) => (
              <SwipeRow
                key={d.id}
                enabled={editDebtId !== d.id}
                onDelete={() => deleteDebtAccount(d)}
              >
                <div
                  className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  onContextMenu={(e) => {
                    if (editDebtId === d.id) return;
                    e.preventDefault();
                    deleteDebtAccount(d);
                  }}
                >
                  {editDebtId === d.id ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Type
                        <select
                          value={editDebtType}
                          onChange={(e) =>
                            setEditDebtType(e.target.value as DebtAccount["debt_type"])
                          }
                          className="rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        >
                          <option value="credit_card">Credit card</option>
                          <option value="loan">Loan</option>
                          <option value="mortgage">Mortgage</option>
                          <option value="student_loan">Student loan</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Name
                        <input
                          value={editDebtName}
                          onChange={(e) => setEditDebtName(e.target.value)}
                          className="rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Balance
                        <input
                          value={editDebtBalance}
                          onChange={(e) => setEditDebtBalance(e.target.value)}
                          inputMode="decimal"
                          className="rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        APR
                        <input
                          value={editDebtApr}
                          onChange={(e) => setEditDebtApr(e.target.value)}
                          inputMode="decimal"
                          className="rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Min payment
                        <input
                          value={editDebtMinPayment}
                          onChange={(e) => setEditDebtMinPayment(e.target.value)}
                          inputMode="decimal"
                          className="rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Due date
                        <input
                          type="date"
                          value={editDebtDueDate}
                          min="2000-01-01"
                          max="2100-12-31"
                          onChange={(e) => {
                            if (e.target.value.length > 10) return;
                            setEditDebtDueDate(e.target.value);
                            if (editDebtDueDateError) setEditDebtDueDateError("");
                          }}
                          onBlur={() =>
                            setEditDebtDueDateError(
                              validateDateInput(editDebtDueDate, { allowEmpty: true })
                            )
                          }
                          className="rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                        {editDebtDueDateError && (
                          <div className="text-xs text-red-600 dark:text-red-400">
                            {editDebtDueDateError}
                          </div>
                        )}
                      </label>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => startEditDebt(d)}
                          className="rounded-md text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-100 hover:underline dark:text-zinc-100 dark:hover:bg-zinc-800"
                        >
                          {d.name}
                        </button>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {debtTypeLabel(d.debt_type)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Balance {formatMoney(d.balance)} | APR{" "}
                        {d.apr === null ? "--" : `${d.apr}%`} | Min{" "}
                        {d.min_payment === null ? "--" : formatMoney(d.min_payment)} | Due{" "}
                        {d.due_date ?? "--"}
                      </div>
                    </>
                  )}
                  <div className="mt-3 flex items-center justify-end gap-2">
                    {editDebtId === d.id ? (
                      <>
                        <button
                          onClick={saveEditDebt}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditDebt}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEditDebt(d)}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </SwipeRow>
            ))
          )}
        </section>
      </main>
    </AuthGate>
  );
}
