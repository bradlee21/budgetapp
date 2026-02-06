"use client";

import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { writeAuthCookie } from "@/lib/authCookies";
import {
  addMonths,
  firstDayOfMonth,
  nextMonth,
  toMonthKey,
  toYMD,
} from "@/lib/date";
import { formatMoney } from "@/lib/format";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
  type ReactNode,
  type ReactElement,
} from "react";
import { useRouter } from "next/navigation";

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

type PlanItem = {
  id: string;
  type: "income" | "expense" | "debt";
  category_id: string;
  credit_card_id: string | null;
  debt_account_id: string | null;
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
  extra?: ReactNode;
  editable?: boolean;
  indent?: number;
  orderableCategoryId?: string;
  deletableCategoryId?: string;
  mobileDraggable?: boolean;
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
    <div className="mt-4 rounded-lg border brand-border brand-panel p-2 sm:mt-8 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="text-lg font-semibold brand-text">{title}</div>
        {header}
      </div>
      <div className="mt-2 overflow-x-hidden sm:mt-4 sm:overflow-x-auto">{children}</div>
    </div>
  );
}

function remainingColorClass(value: number) {
  return value < 0 ? "text-rose-600 dark:text-rose-400" : "";
}

function SectionTotals({
  planned,
  actual,
  remaining,
  actualLabel,
  remainingLabel,
}: {
  planned: number;
  actual: number;
  remaining: number;
  actualLabel: string;
  remainingLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
      <span>
        Planned{" "}
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {formatMoney(planned)}
        </span>
      </span>
      <span>
        {actualLabel}{" "}
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {formatMoney(actual)}
        </span>
      </span>
      <span>
        {remainingLabel}{" "}
        <span
          className={`font-semibold ${
            remaining < 0
              ? "text-rose-600 dark:text-rose-400"
              : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {formatMoney(remaining)}
        </span>
      </span>
    </div>
  );
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
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
          }}
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

function BudgetTable({
  rows,
  onDrop,
  editPlannedKey,
  editPlannedAmount,
  setEditPlannedAmount,
  onSavePlanned,
  onCancelPlanned,
  onStartEditPlanned,
  editNameId,
  editNameValue,
  setEditNameValue,
  onStartEditName,
  onSaveName,
  onCancelName,
  setDragCategoryId,
  onDeleteCategory,
  plannedLabel,
  actualLabel,
  remainingLabel,
}: {
  rows: BudgetRow[];
  onDrop: (categoryId: string, draggedId?: string | null) => void;
  editPlannedKey: string | null;
  editPlannedAmount: string;
  setEditPlannedAmount: (v: string) => void;
  onSavePlanned: (rowId: string) => void;
  onCancelPlanned: () => void;
  onStartEditPlanned: (rowId: string, planned: number) => void;
  editNameId: string | null;
  editNameValue: string;
  setEditNameValue: (v: string) => void;
  onStartEditName: (categoryId: string, currentName: string) => void;
  onSaveName: (categoryId: string) => void;
  onCancelName: () => void;
  setDragCategoryId: (id: string | null) => void;
  onDeleteCategory: (categoryId: string) => void;
  plannedLabel: string;
  actualLabel: string;
  remainingLabel: string;
}) {
  const touchDragTimerRef = useRef<number | null>(null);
  const touchDragActiveRef = useRef(false);
  const touchDragIdRef = useRef<string | null>(null);
  const touchTargetIdRef = useRef<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [touchDraggingId, setTouchDraggingId] = useState<string | null>(null);

  function clearTouchDragTimer() {
    if (touchDragTimerRef.current) {
      window.clearTimeout(touchDragTimerRef.current);
      touchDragTimerRef.current = null;
    }
  }

  function startTouchDrag(e: TouchEvent, id?: string) {
    if (!id) return;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchDragIdRef.current = id;
    touchTargetIdRef.current = null;
    clearTouchDragTimer();
    touchDragTimerRef.current = window.setTimeout(() => {
      touchDragActiveRef.current = true;
      setTouchDraggingId(id);
    }, 250);
  }

  function moveTouchDrag(e: TouchEvent) {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    if (!touchDragActiveRef.current && Math.abs(dx) + Math.abs(dy) > 12) {
      clearTouchDragTimer();
      return;
    }
    if (touchDragActiveRef.current) {
      e.preventDefault();
      const target = document
        .elementFromPoint(touch.clientX, touch.clientY)
        ?.closest("[data-dnd-id]") as HTMLElement | null;
      if (target) {
        touchTargetIdRef.current = target.dataset.dndId ?? null;
      }
    }
  }

  function endTouchDrag() {
    clearTouchDragTimer();
    if (touchDragActiveRef.current && touchDragIdRef.current) {
      const targetId = touchTargetIdRef.current;
      if (targetId && targetId !== touchDragIdRef.current) {
        onDrop(targetId, touchDragIdRef.current);
      }
    }
    touchDragActiveRef.current = false;
    touchDragIdRef.current = null;
    touchTargetIdRef.current = null;
    touchStartRef.current = null;
    setTouchDraggingId(null);
  }

  return (
    <>
      <div className="space-y-1 sm:hidden">
        {rows.length === 0 ? (
          <div className="rounded-md border border-zinc-200 bg-white p-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 sm:p-3">
            Nothing here yet.
          </div>
        ) : (
          rows.map((r) => (
            <SwipeRow
              key={r.id}
              enabled={!!r.deletableCategoryId && !touchDraggingId}
              onDelete={() => onDeleteCategory(r.deletableCategoryId!)}
              deleteLabel="Delete"
            >
              <div
                data-dnd-id={r.orderableCategoryId ?? undefined}
                className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950 sm:p-3"
                onTouchStart={(e) => {
                  if (r.mobileDraggable === false) return;
                  startTouchDrag(e, r.orderableCategoryId);
                }}
                onTouchMove={moveTouchDrag}
                onTouchEnd={endTouchDrag}
                onTouchCancel={endTouchDrag}
                onDragOver={
                  r.orderableCategoryId
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    : undefined
                }
                onDrop={
                  r.orderableCategoryId
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const draggedId = e.dataTransfer.getData("text/plain");
                        if (draggedId) setDragCategoryId(draggedId);
                        onDrop(r.orderableCategoryId!, draggedId || null);
                      }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {r.orderableCategoryId && editNameId === r.orderableCategoryId ? (
                      <div className="grid gap-2">
                        <input
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onSaveName(r.orderableCategoryId!);
                            if (e.key === "Escape") onCancelName();
                          }}
                          autoFocus
                          className="w-full rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onSaveName(r.orderableCategoryId!)}
                            className="btn-brand rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                          >
                            Save
                          </button>
                          <button
                            onClick={onCancelName}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : r.orderableCategoryId ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            onStartEditName(r.orderableCategoryId!, r.label)
                          }
                          className="rounded-md text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100 hover:underline dark:text-zinc-100 dark:hover:bg-zinc-800"
                          title="Edit name"
                        >
                          {r.label}
                        </button>
                        <button
                          onClick={() =>
                            onStartEditName(r.orderableCategoryId!, r.label)
                          }
                          className="rounded-md px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:hidden"
                          aria-label={`Edit ${r.label}`}
                          title="Edit name"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div className="font-medium">{r.label}</div>
                    )}
                    {r.extra && (
                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {r.extra}
                      </div>
                  )}
                </div>
                <div className="flex items-center gap-2" />
              </div>

              <div className="mt-1 grid grid-cols-2 gap-1 border-t border-zinc-200 pt-1 text-sm tabular-nums text-zinc-900 dark:border-zinc-800 dark:text-zinc-100 sm:mt-3 sm:gap-2 sm:pt-2">
                <div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">Planned</div>
                  <div className="mt-1">
                    {r.editable === false ? (
                      formatMoney(r.planned)
                    ) : editPlannedKey === r.id ? (
                      <div className="grid gap-2">
                        <input
                          value={editPlannedAmount}
                          onChange={(e) => setEditPlannedAmount(e.target.value)}
                          inputMode="decimal"
                          autoFocus
                          className="w-full rounded-md border border-zinc-300 bg-white p-2 text-right text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onSavePlanned(r.id)}
                            className="btn-brand rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
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
                      </div>
                    ) : (
                      <button
                        onClick={() => onStartEditPlanned(r.id, r.planned)}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 hover:underline dark:text-zinc-100 dark:hover:bg-zinc-800"
                        title="Edit planned total"
                      >
                        {formatMoney(r.planned)}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {remainingLabel}
                  </div>
                  <div className={`mt-1 ${remainingColorClass(r.remaining)}`}>
                    {formatMoney(r.remaining)}
                  </div>
                </div>
              </div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 sm:mt-2">
                {actualLabel}: <span className="font-semibold">{formatMoney(r.actual)}</span>
              </div>
              </div>
            </SwipeRow>
          ))
        )}
      </div>

      <div className="hidden w-full overflow-x-auto sm:block">
        <table className="min-w-[520px] w-full border-collapse text-sm">
          <thead className="brand-table-head text-zinc-700 dark:text-zinc-300">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right font-semibold text-zinc-900 dark:text-zinc-100">
                {plannedLabel}
              </th>
              <th className="p-2 text-right text-zinc-500 dark:text-zinc-400">
                {actualLabel}
              </th>
              <th className="p-2 text-right text-zinc-500 dark:text-zinc-400">
                {remainingLabel}
              </th>
            </tr>
          </thead>
          <tbody className="text-zinc-900 dark:text-zinc-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  className="p-2 text-zinc-600 dark:text-zinc-300"
                  colSpan={4}
                >
                  Nothing here yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="group border-t border-zinc-200 dark:border-zinc-800"
                  draggable={!!r.orderableCategoryId}
                  onContextMenu={
                    r.deletableCategoryId
                      ? (e) => {
                          e.preventDefault();
                          onDeleteCategory(r.deletableCategoryId!);
                        }
                      : undefined
                  }
                  onDragStart={
                    r.orderableCategoryId
                      ? (e) => {
                          setDragCategoryId(r.orderableCategoryId!);
                          e.dataTransfer.setData("text/plain", r.orderableCategoryId!);
                          e.dataTransfer.effectAllowed = "move";
                        }
                      : undefined
                  }
                  onDragEnd={
                    r.orderableCategoryId ? () => setDragCategoryId(null) : undefined
                  }
                  onDragOver={
                    r.orderableCategoryId
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      : undefined
                  }
                  onDrop={
                    r.orderableCategoryId
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const draggedId = e.dataTransfer.getData("text/plain");
                          if (draggedId) setDragCategoryId(draggedId);
                          onDrop(r.orderableCategoryId!, draggedId || null);
                        }
                      : undefined
                  }
                >
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="font-medium"
                        style={{ paddingLeft: (r.indent ?? 0) * 16 }}
                      >
                        {r.orderableCategoryId && editNameId === r.orderableCategoryId ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") onSaveName(r.orderableCategoryId!);
                                if (e.key === "Escape") onCancelName();
                              }}
                              autoFocus
                              className="w-[220px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            />
                            <button
                              onClick={() => onSaveName(r.orderableCategoryId!)}
                              className="btn-brand rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                            >
                              Save
                            </button>
                            <button
                              onClick={onCancelName}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : r.orderableCategoryId ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                onStartEditName(r.orderableCategoryId!, r.label)
                              }
                              className="rounded-md text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100 hover:underline dark:text-zinc-100 dark:hover:bg-zinc-800"
                              title="Edit name"
                            >
                              {r.label}
                            </button>
                            <button
                              onClick={() =>
                                onStartEditName(r.orderableCategoryId!, r.label)
                              }
                              className="hidden rounded-md px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 group-hover:inline-flex dark:text-zinc-300 dark:hover:bg-zinc-800 sm:hidden"
                              aria-label={`Edit ${r.label}`}
                              title="Edit name"
                            >
                              Edit
                            </button>
                          </div>
                        ) : (
                          r.label
                        )}
                      </div>
                    </div>
                    {r.extra && (
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">
                        {r.extra}
                      </div>
                    )}
                  </td>
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
                          className="btn-brand rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
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
                        className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 hover:underline dark:text-zinc-100 dark:hover:bg-zinc-800"
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
                    <span className={remainingColorClass(r.remaining)}>
                      {formatMoney(r.remaining)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function BudgetPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const [showDebug, setShowDebug] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [debtAccounts, setDebtAccounts] = useState<DebtAccount[]>([]);
  const [planRows, setPlanRows] = useState<PlanItem[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [budgetMonth, setBudgetMonth] = useState<BudgetMonth | null>(null);
  const [archivedCategories, setArchivedCategories] = useState<Category[]>([]);
  const archivedSorted = useMemo(() => {
    return archivedCategories
      .slice()
      .sort(
        (a, b) =>
          a.group_name.localeCompare(b.group_name) ||
          a.name.localeCompare(b.name)
      );
  }, [archivedCategories]);
  const [availableStart, setAvailableStart] = useState("");
  const [availableDirty, setAvailableDirty] = useState(false);
  const [savingAvailable, setSavingAvailable] = useState(false);
  const [editPlannedKey, setEditPlannedKey] = useState<string | null>(null);
  const [editPlannedAmount, setEditPlannedAmount] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
  const groupTouchTimerRef = useRef<number | null>(null);
  const groupTouchActiveRef = useRef(false);
  const groupTouchIdRef = useRef<string | null>(null);
  const groupTouchTargetRef = useRef<string | null>(null);
  const groupTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [groupTouchDraggingId, setGroupTouchDraggingId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState({
    income: "",
    giving: "",
    savings: "",
    expense: "",
    debt: "",
  });
  const [newChildName, setNewChildName] = useState<Record<string, string>>({});

  const [txnDate, setTxnDate] = useState(toYMD(new Date()));
  const [txnAmount, setTxnAmount] = useState("");
  const [txnCategoryId, setTxnCategoryId] = useState("");
  const [txnCardSelectId, setTxnCardSelectId] = useState("");
  const [txnDebtAccountId, setTxnDebtAccountId] = useState("");
  const [txnDescription, setTxnDescription] = useState("");
  const [editTxnId, setEditTxnId] = useState<string | null>(null);
  const [editTxnDate, setEditTxnDate] = useState("");
  const [editTxnAmount, setEditTxnAmount] = useState("");
  const [editTxnCategoryId, setEditTxnCategoryId] = useState("");
  const [editTxnCardSelectId, setEditTxnCardSelectId] = useState("");
  const [editTxnDebtAccountId, setEditTxnDebtAccountId] = useState("");
  const [editTxnDescription, setEditTxnDescription] = useState("");
  const [txnFilterGroup, setTxnFilterGroup] = useState<
    "all" | "income" | "giving" | "savings" | "expense" | "debt"
  >("all");
  const [txnSearch, setTxnSearch] = useState("");
  const [txnDateError, setTxnDateError] = useState("");
  const [editTxnDateError, setEditTxnDateError] = useState("");

  const [debtName, setDebtName] = useState("");
  const [debtType, setDebtType] = useState<
    "credit_card" | "loan" | "mortgage" | "student_loan" | "other"
  >("credit_card");
  const [debtBalance, setDebtBalance] = useState("");
  const [debtApr, setDebtApr] = useState("");
  const [debtMinPayment, setDebtMinPayment] = useState("");
  const [debtDueDate, setDebtDueDate] = useState("");
  const [debtDueDateError, setDebtDueDateError] = useState("");
  const [editDebtId, setEditDebtId] = useState<string | null>(null);
  const [editDebtType, setEditDebtType] = useState<
    "credit_card" | "loan" | "mortgage" | "student_loan" | "other"
  >("credit_card");
  const [editDebtName, setEditDebtName] = useState("");
  const [editDebtBalance, setEditDebtBalance] = useState("");
  const [editDebtApr, setEditDebtApr] = useState("");
  const [editDebtMinPayment, setEditDebtMinPayment] = useState("");
  const [editDebtDueDate, setEditDebtDueDate] = useState("");
  const [editDebtDueDateError, setEditDebtDueDateError] = useState("");
  const [addIncomeOpen, setAddIncomeOpen] = useState(false);
  const [addGivingOpen, setAddGivingOpen] = useState(false);
  const [addSavingsOpen, setAddSavingsOpen] = useState(false);
  const [addExpenseGroupOpen, setAddExpenseGroupOpen] = useState(false);
  const [addChildOpenId, setAddChildOpenId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    body: string;
  }>({ open: false, title: "", body: "" });
  const confirmActionRef = useRef<null | (() => Promise<void>)>(null);
  const seedDefaultsPromiseRef = useRef<Promise<Category[]> | null>(null);

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

  const creditCardDebtAccounts = useMemo(() => {
    return debtAccounts.filter((d) => d.debt_type === "credit_card");
  }, [debtAccounts]);

  const cardLikeAccounts = useMemo(
    () => [
      ...cards.map((c) => ({
        id: c.id,
        name: c.name,
        balance: Number(c.current_balance),
        kind: "card" as const,
      })),
      ...creditCardDebtAccounts.map((d) => ({
        id: d.id,
        name: d.name,
        balance: Number(d.balance),
        kind: "debt" as const,
      })),
    ],
    [cards, creditCardDebtAccounts]
  );

  const debtTypeLabel = (value: DebtAccount["debt_type"]) => {
    switch (value) {
      case "credit_card":
        return "Credit card";
      case "loan":
        return "Loan";
      case "mortgage":
        return "Mortgage";
      case "student_loan":
        return "Student loan";
      case "other":
      default:
        return "Other";
    }
  };

  // NEW RULE: any DEBT category containing "credit card" is treated as "credit card payment"
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
    if (!txnNeedsDebtAccount) setTxnDebtAccountId("");
  }, [txnNeedsDebtAccount]);

  useEffect(() => {
    if (!editTxnNeedsDebtAccount) setEditTxnDebtAccountId("");
  }, [editTxnNeedsDebtAccount]);

  useEffect(() => {
    if (!txnNeedsCard) setTxnCardSelectId("");
  }, [txnNeedsCard]);

  useEffect(() => {
    if (!editTxnNeedsCard) setEditTxnCardSelectId("");
  }, [editTxnNeedsCard]);

  useEffect(() => {
    const defaults = loadTxnFormDefaults();
    if (!defaults) return;
    if (defaults.categoryId) setTxnCategoryId(defaults.categoryId);
    if (defaults.cardSelectId) setTxnCardSelectId(defaults.cardSelectId);
    if (defaults.debtAccountId) setTxnDebtAccountId(defaults.debtAccountId);
  }, []);

  async function seedDefaultCategories(seedUserId: string) {
    const flatDefaults: Array<{ group: Category["group_name"]; names: string[] }> =
      [
        { group: "income", names: ["Primary Income", "Other Income"] },
        { group: "giving", names: ["Tithe", "Charity"] },
        {
          group: "savings",
          names: ["Emergency Fund", "Sinking Fund", "Long-Term Savings"],
        },
        { group: "debt", names: ["Credit Card", "Debt Payment"] },
      ];

    const expenseGroups: Array<{ name: string; children: string[] }> = [
      {
        name: "Housing",
        children: ["Rent/Mortgage", "Utilities", "Internet"],
      },
      {
        name: "Transportation",
        children: ["Gas", "Maintenance", "Insurance"],
      },
      {
        name: "Food",
        children: ["Groceries", "Restaurants"],
      },
      {
        name: "Lifestyle",
        children: ["Entertainment", "Subscriptions"],
      },
      {
        name: "Health",
        children: ["Medical", "Pharmacy"],
      },
      {
        name: "Personal",
        children: ["Clothing", "Personal Care"],
      },
      {
        name: "Insurance",
        children: ["Health", "Auto", "Home/Renters"],
      },
    ];

    const parentPayload = [
      ...flatDefaults.flatMap((d) =>
        d.names.map((name, idx) => ({
          user_id: seedUserId,
          group_name: d.group,
          name,
          parent_id: null,
          sort_order: idx + 1,
        }))
      ),
      ...expenseGroups.map((g, idx) => ({
        user_id: seedUserId,
        group_name: "expense" as const,
        name: g.name,
        parent_id: null,
        sort_order: idx + 1,
      })),
    ];

    const { data: parentData, error: parentErr } = await supabase
      .from("categories")
      .insert(parentPayload)
      .select("id, group_name, name, parent_id, sort_order, is_archived");
    if (parentErr) throw parentErr;

    const parentByName = new Map<string, Category>();
    for (const p of parentData ?? []) {
      if (p.group_name === "expense") parentByName.set(p.name, p as Category);
    }

    const childPayload = expenseGroups.flatMap((g) => {
      const parent = parentByName.get(g.name);
      if (!parent) return [];
      return g.children.map((name, idx) => ({
        user_id: seedUserId,
        group_name: "expense" as const,
        name,
        parent_id: parent.id,
        sort_order: idx + 1,
      }));
    });

    const { data: childData, error: childErr } = await supabase
      .from("categories")
      .insert(childPayload)
      .select("id, group_name, name, parent_id, sort_order, is_archived");
    if (childErr) throw childErr;

    return ([...(parentData ?? []), ...(childData ?? [])] as Category[]);
  }

  function isDuplicateCategoryError(err: any) {
    const msg = String(err?.message ?? err ?? "");
    return (
      err?.code === "23505" ||
      msg.includes("categories_unique_user_group_parent_lowername") ||
      msg.includes("duplicate key value")
    );
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

  async function fetchActiveCategories() {
    const { data, error } = await supabase
      .from("categories")
      .select("id, group_name, name, parent_id, sort_order, is_archived")
      .eq("is_archived", false)
      .order("group_name", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;
    return (data ?? []) as Category[];
  }

  async function ensureSeeded(seedUserId: string) {
    if (seedDefaultsPromiseRef.current) {
      return seedDefaultsPromiseRef.current;
    }
    const run = (async () => {
      try {
        return await seedDefaultCategories(seedUserId);
      } catch (e: any) {
        if (isDuplicateCategoryError(e)) {
          return await fetchActiveCategories();
        }
        throw e;
      } finally {
        seedDefaultsPromiseRef.current = null;
      }
    })();
    seedDefaultsPromiseRef.current = run;
    return run;
  }

  async function loadAll() {
    setMsg("");
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);

      let nextCats = await fetchActiveCategories();
      if (nextCats.length === 0) {
        nextCats = await ensureSeeded(u.user.id);
      }
      if (!hasCreditCardCategory(nextCats)) {
        const nextOrder =
          nextCats
            .filter((c) => c.group_name === "debt")
            .reduce((max, c) => Math.max(max, c.sort_order), 0) + 1;
        const { data: created, error: createErr } = await supabase
          .from("categories")
          .insert({
            user_id: u.user.id,
            group_name: "debt",
            name: "Credit Card",
            parent_id: null,
            sort_order: nextOrder,
          })
          .select("id, group_name, name, parent_id, sort_order, is_archived")
          .single();
        if (createErr && !isDuplicateCategoryError(createErr)) throw createErr;
        if (created) {
          nextCats = sortCategories([...nextCats, created as Category]);
        }
      }
      setCategories(nextCats);

      const { data: archived, error: archErr } = await supabase
        .from("categories")
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .eq("is_archived", true)
        .order("group_name", { ascending: true })
        .order("name", { ascending: true });
      if (archErr) throw archErr;
      setArchivedCategories((archived ?? []) as Category[]);

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

      const { data: plan, error: planErr } = await supabase
        .from("planned_items")
        .select("id, type, category_id, credit_card_id, debt_account_id, name, amount")
        .eq("user_id", u.user.id)
        .eq("month", monthKey);

      if (planErr) throw planErr;

      setPlanRows(
        (plan ?? []).map((p: any) => ({
          id: p.id,
          type: p.type,
          category_id: p.category_id,
          credit_card_id: p.credit_card_id ?? null,
          debt_account_id: p.debt_account_id ?? null,
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
        const key = `CC::${p.credit_card_id ?? p.debt_account_id ?? "none"}`;
        m.set(key, (m.get(key) ?? 0) + p.amount);
      } else if (p.debt_account_id) {
        const key = `DEBT::${p.debt_account_id}`;
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
        const key = `CC::${t.credit_card_id ?? t.debt_account_id ?? "none"}`;
        m.set(key, (m.get(key) ?? 0) + t.amount);
      } else if (t.debt_account_id) {
        const key = `DEBT::${t.debt_account_id}`;
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
        return !!cat && cat.group_name === "income";
      })
      .reduce((s, p) => s + p.amount, 0);
  }, [planRows, categoryById]);

  const plannedOut = useMemo(() => {
    const base = planRows
      .filter((p) => {
        const cat = categoryById.get(p.category_id);
        return !!cat && cat.group_name !== "income";
      })
      .reduce((s, p) => s + p.amount, 0);

    const debtFallback = debtAccounts.reduce((sum, d) => {
      const debtKey = `DEBT::${d.id}`;
      const ccKey = `CC::${d.id}`;
      if (plannedMap.has(debtKey)) return sum;
      if (d.debt_type === "credit_card" && plannedMap.has(ccKey)) return sum;
      return sum + (d.min_payment ?? 0);
    }, 0);

    return base + debtFallback;
  }, [planRows, categoryById, debtAccounts, plannedMap]);

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
        return cat?.group_name !== "income" && cat?.group_name !== "savings";
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [txns, categoryById]);

  const plannedNet = plannedIncome - plannedOut;
  const actualNet = actualIncome - actualOut;

  const debtPaymentsThisMonth = useMemo(() => {
    return txns
      .filter((t) => {
        const cat = t.category_id ? categoryById.get(t.category_id) : null;
        return cat?.group_name === "debt";
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [txns, categoryById]);

  const filteredTxns = useMemo(() => {
    const q = txnSearch.trim().toLowerCase();
    return txns.filter((t) => {
      if (txnFilterGroup !== "all") {
        const cat = t.category_id ? categoryById.get(t.category_id) : null;
        if (!cat || cat.group_name !== txnFilterGroup) return false;
      }
      if (!q) return true;
      const cat = t.category_id ? categoryById.get(t.category_id) : null;
      const hay = [
        t.name ?? "",
        cat?.name ?? "",
        cat?.group_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [txns, txnFilterGroup, txnSearch, categoryById]);

  const filteredTxnTotal = useMemo(() => {
    return filteredTxns.reduce((s, t) => s + t.amount, 0);
  }, [filteredTxns]);

  const DEFAULT_CATEGORY_NAMES: Record<Category["group_name"], string[]> = {
    income: ["Primary Income", "Other Income"],
    giving: ["Tithe", "Charity"],
    savings: ["Emergency Fund", "Sinking Fund", "Long-Term Savings"],
    expense: [
      "Housing",
      "Transportation",
      "Food",
      "Lifestyle",
      "Health",
      "Personal",
      "Insurance",
      "Rent/Mortgage",
      "Utilities",
      "Internet",
      "Gas",
      "Maintenance",
      "Groceries",
      "Restaurants",
      "Entertainment",
      "Subscriptions",
      "Medical",
      "Pharmacy",
      "Clothing",
      "Personal Care",
      "Auto",
      "Home/Renters",
    ],
    debt: ["Credit Card", "Debt Payment"],
    misc: ["Misc"],
  };

  function isDefaultCategory(cat: Category) {
    return DEFAULT_CATEGORY_NAMES[cat.group_name]?.includes(cat.name) ?? false;
  }

  async function updatePlannedTotal(rowKey: string) {
    if (!userId) return;
    const target =
      rowKey.startsWith("CAT::")
        ? { kind: "category" as const, id: rowKey.slice(5) }
        : rowKey.startsWith("CC::")
        ? { kind: "card" as const, id: rowKey.slice(4) }
        : rowKey.startsWith("DEBT::")
        ? { kind: "debt" as const, id: rowKey.slice(6) }
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
        : target.kind === "card"
        ? planRows.filter(
            (p) =>
              creditCardCategoryIds.includes(p.category_id) &&
              p.credit_card_id === target.id
          )
        : planRows.filter((p) => {
            if (p.debt_account_id === target.id) return true;
            const debt = debtById.get(target.id);
            if (debt?.debt_type !== "credit_card") return false;
            return (
              creditCardCategoryIds.includes(p.category_id) &&
              p.credit_card_id === target.id
            );
          });

    let categoryId = "";
    let creditCardId: string | null = null;
    let debtAccountId: string | null = null;
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
    } else if (target.kind === "card") {
      if (!primaryCreditCardCategoryId) {
        setMsg('Create a Debt category containing "credit card" first.');
        return;
      }
      categoryId = primaryCreditCardCategoryId;
      creditCardId = target.id;
      type = "debt";
    } else {
      let nonCcDebtCat = categories.find(
        (c) =>
          c.group_name === "debt" &&
          !creditCardCategoryIds.includes(c.id)
      );
      if (!nonCcDebtCat) {
        try {
          const created = await createCategory({
            group: "debt",
            name: "Debt Payment",
            parentId: null,
          });
          if (created) {
            nonCcDebtCat = created;
          }
        } catch (e: any) {
          setMsg(e?.message ?? "Create a non-credit-card Debt category first.");
          return;
        }
      }
      if (!nonCcDebtCat) {
        setMsg("Create a non-credit-card Debt category first.");
        return;
      }
      categoryId = nonCcDebtCat.id;
      debtAccountId = target.id;
      type = "debt";
    }

    try {
      const applyPlannedTotal = async () => {
        if (items.length === 1) {
          const { data, error } = await supabase
            .from("planned_items")
            .update({ amount: amt })
            .eq("id", items[0].id)
            .select(
              "id, type, category_id, credit_card_id, debt_account_id, name, amount"
            )
            .single();
          if (error) throw error;
          setPlanRows((prev) =>
            prev.map((p) =>
              p.id === data.id
                ? {
                    ...p,
                    amount: Number(data.amount),
                    debt_account_id: data.debt_account_id ?? null,
                  }
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
            setPlanRows((prev) =>
              prev.filter((p) => !items.some((x) => x.id === p.id))
            );
          }

          const payload: any = {
            user_id: userId,
            month: monthKey,
            type,
            category_id: categoryId,
            credit_card_id: creditCardId,
            debt_account_id: debtAccountId,
            name: "Planned total",
            amount: amt,
          };
          const { data, error } = await supabase
            .from("planned_items")
            .insert([payload])
            .select(
              "id, type, category_id, credit_card_id, debt_account_id, name, amount"
            )
            .single();
          if (error) throw error;
          setPlanRows((prev) => [
            ...prev,
            {
              id: data.id,
              type: data.type,
              category_id: data.category_id,
              credit_card_id: data.credit_card_id ?? null,
              debt_account_id: data.debt_account_id ?? null,
              name: data.name,
              amount: Number(data.amount),
            },
          ]);
        }

        setEditPlannedKey(null);
        setEditPlannedAmount("");
        setMsg("Planned total updated.");
      };

      if (items.length > 1) {
        confirmActionRef.current = async () => {
          await applyPlannedTotal();
        };
        setConfirmState({
          open: true,
          title: "Replace planned items?",
          body:
            "This category has multiple planned items. Replace them with a single total?",
        });
        return;
      }

      await applyPlannedTotal();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function removeCategory(categoryId: string) {
    setMsg("");
    try {
      const cat = categoryById.get(categoryId);
      if (!cat) {
        setMsg("Category not found.");
        return;
      }
      const hasChildren = categories.some((c) => c.parent_id === categoryId);
      if (hasChildren) {
        setMsg("Delete or move its children first (or archive it).");
        return;
      }
      if (isDefaultCategory(cat) && cat.parent_id === null) {
        setMsg("Default groups cannot be hidden or deleted.");
        return;
      }
      if (isDefaultCategory(cat)) {
        confirmActionRef.current = async () => {
          const { error } = await supabase
            .from("categories")
            .update({ is_archived: true })
            .eq("id", categoryId);
          if (error) throw error;

          setCategories((prev) => prev.filter((c) => c.id !== categoryId));
        };
        setConfirmState({
          open: true,
          title: "Hide category?",
          body: "This default category will be hidden.",
        });
      } else {
        confirmActionRef.current = async () => {
          const { error } = await supabase
            .from("categories")
            .delete()
            .eq("id", categoryId);
          if (error) throw error;

          setCategories((prev) => prev.filter((c) => c.id !== categoryId));
        };
        setConfirmState({
          open: true,
          title: "Delete category?",
          body: "This cannot be undone.",
        });
      }
    } catch (e: any) {
      setMsg(
        e?.message ??
          "Couldn't delete. It may be used by planned items or transactions."
      );
    }
  }

  async function restoreCategory(categoryId: string) {
    setMsg("");
    try {
      const { error } = await supabase
        .from("categories")
        .update({ is_archived: false })
        .eq("id", categoryId);
      if (error) throw error;

      const restored = archivedCategories.find((c) => c.id === categoryId);
      if (restored) {
        setArchivedCategories((prev) => prev.filter((c) => c.id !== categoryId));
        setCategories((prev) =>
          [...prev, { ...restored, is_archived: false }].sort((a, b) => {
            if (a.group_name !== b.group_name) return a.group_name.localeCompare(b.group_name);
            if ((a.parent_id ?? "") !== (b.parent_id ?? ""))
              return (a.parent_id ?? "").localeCompare(b.parent_id ?? "");
            return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
          })
        );
      }
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  function startEditPlanned(rowId: string, planned: number) {
    setEditPlannedKey(rowId);
    setEditPlannedAmount(planned === 0 ? "" : String(planned));
  }

  function cancelEditPlanned() {
    setEditPlannedKey(null);
    setEditPlannedAmount("");
  }

  function clearGroupTouchTimer() {
    if (groupTouchTimerRef.current) {
      window.clearTimeout(groupTouchTimerRef.current);
      groupTouchTimerRef.current = null;
    }
  }

  function startGroupTouchDrag(e: TouchEvent, id?: string) {
    if (!id) return;
    if (e.touches.length !== 1) return;
    const target = (e.target as HTMLElement | null)?.closest("[data-dnd-id]") as
      | HTMLElement
      | null;
    if (target && target.dataset.dndId !== id) return;
    const touch = e.touches[0];
    groupTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
    groupTouchIdRef.current = id;
    groupTouchTargetRef.current = null;
    clearGroupTouchTimer();
    groupTouchTimerRef.current = window.setTimeout(() => {
      groupTouchActiveRef.current = true;
      setGroupTouchDraggingId(id);
    }, 250);
  }

  function moveGroupTouchDrag(e: TouchEvent) {
    if (!groupTouchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - groupTouchStartRef.current.x;
    const dy = touch.clientY - groupTouchStartRef.current.y;
    if (!groupTouchActiveRef.current && Math.abs(dx) + Math.abs(dy) > 12) {
      clearGroupTouchTimer();
      return;
    }
    if (groupTouchActiveRef.current) {
      e.preventDefault();
      const target = document
        .elementFromPoint(touch.clientX, touch.clientY)
        ?.closest("[data-dnd-id]") as HTMLElement | null;
      if (target) {
        groupTouchTargetRef.current = target.dataset.dndId ?? null;
      }
    }
  }

  function endGroupTouchDrag() {
    clearGroupTouchTimer();
    if (groupTouchActiveRef.current && groupTouchIdRef.current) {
      const targetId = groupTouchTargetRef.current;
      if (targetId && targetId !== groupTouchIdRef.current) {
        onDropCategory(targetId, groupTouchIdRef.current);
      }
    }
    groupTouchActiveRef.current = false;
    groupTouchIdRef.current = null;
    groupTouchTargetRef.current = null;
    groupTouchStartRef.current = null;
    setGroupTouchDraggingId(null);
  }

  async function handleConfirm() {
    const action = confirmActionRef.current;
    confirmActionRef.current = null;
    setConfirmState({ open: false, title: "", body: "" });
    if (action) {
      await action();
    }
  }


  async function createCategory({
    group,
    name,
    parentId,
  }: {
    group: Category["group_name"];
    name: string;
    parentId: string | null;
  }) {
    if (!userId) return;
    const clean = name.trim();
    if (!clean) throw new Error("Enter a name.");

    if (parentId) {
      const p = categoryById.get(parentId);
      if (!p) throw new Error("Parent not found.");
      if (p.group_name !== group) throw new Error("Parent must be in the same section.");
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
          name: clean,
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

    return data as Category;
  }

  async function addGroup(
    group: "income" | "giving" | "savings" | "expense" | "debt"
  ) {
    setMsg("");
    try {
      const name = newGroupName[group].trim();
      await createCategory({ group, name, parentId: null });
      setNewGroupName((prev) => ({ ...prev, [group]: "" }));
      setMsg(`Added "${name}".`);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function addChildCategory(group: Category["group_name"], parentId: string) {
    setMsg("");
    try {
      const name = (newChildName[parentId] ?? "").trim();
      await createCategory({ group, name, parentId });
      setNewChildName((prev) => ({ ...prev, [parentId]: "" }));
      setMsg(`Added "${name}".`);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  function startEditCategoryName(categoryId: string, currentName: string) {
    setEditCategoryId(categoryId);
    setEditCategoryName(currentName);
  }

  function cancelEditCategoryName() {
    setEditCategoryId(null);
    setEditCategoryName("");
  }

  async function saveCategoryName(categoryId: string) {
    setMsg("");
    try {
      const name = editCategoryName.trim();
      if (!name) throw new Error("Enter a name.");
      const { error } = await supabase
        .from("categories")
        .update({ name })
        .eq("id", categoryId);
      if (error) throw error;
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, name } : c))
      );
      setEditCategoryId(null);
      setEditCategoryName("");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

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
      const minPay =
        editDebtMinPayment.trim() === "" ? null : Number(editDebtMinPayment);
      if (!Number.isFinite(bal)) throw new Error("Balance must be a number.");
      if (apr !== null && !Number.isFinite(apr))
        throw new Error("APR must be a number.");
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
                debt_type: (data.debt_type ??
                  "credit_card") as DebtAccount["debt_type"],
                balance: Number(data.balance),
                apr: data.apr === null ? null : Number(data.apr),
                min_payment:
                  data.min_payment === null ? null : Number(data.min_payment),
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

  async function onDropCategory(targetCategoryId: string, draggedId?: string | null) {
    const activeDragId = draggedId || dragCategoryId;
    if (!activeDragId || activeDragId === targetCategoryId) return;

    const dragged = categoryById.get(activeDragId);
    const target = categoryById.get(targetCategoryId);
    if (!dragged || !target) return;

    if (dragged.group_name !== target.group_name) {
      return;
    }

    let targetParentId = target.parent_id ?? null;
    const draggedParentId = dragged.parent_id ?? null;
    const draggedHasChildren = categories.some((c) => c.parent_id === dragged.id);
    if (!target.parent_id && draggedParentId && !draggedHasChildren) {
      // dropping a child onto a group moves it into that group
      targetParentId = target.id;
    }
    if (draggedHasChildren && targetParentId) {
      // prevent nesting a parent under another parent
      return;
    }

    const targetSiblings = categories
      .filter(
        (c) =>
          c.group_name === dragged.group_name &&
          (c.parent_id ?? null) === targetParentId
      )
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    const fromIndex = targetSiblings.findIndex((c) => c.id === dragged.id);
    let toIndex = targetSiblings.findIndex((c) => c.id === target.id);
    if (toIndex === -1) toIndex = targetSiblings.length;
    const inSameParent = draggedParentId === targetParentId;

    const next = targetSiblings.slice();
    if (inSameParent && fromIndex !== -1) {
      const [moved] = next.splice(fromIndex, 1);
      const adjustedIndex = fromIndex < toIndex ? Math.max(0, toIndex - 1) : toIndex;
      next.splice(adjustedIndex, 0, moved);
    } else {
      next.splice(toIndex, 0, { ...dragged, parent_id: targetParentId });
    }

    const updates = [];
    if (!inSameParent) {
      updates.push(
        supabase
          .from("categories")
          .update({ parent_id: targetParentId })
          .eq("id", dragged.id)
      );
    }
    updates.push(
      ...next.map((c, i) =>
        supabase.from("categories").update({ sort_order: i + 1 }).eq("id", c.id)
      )
    );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error)?.error;
    if (err) {
      setMsg(err.message);
      return;
    }

    const orderMap = new Map<string, number>();
    next.forEach((c, i) => orderMap.set(c.id, i + 1));
    setCategories((prev) =>
      prev.map((c) =>
        orderMap.has(c.id)
          ? {
              ...c,
              sort_order: orderMap.get(c.id)!,
              parent_id: c.id === dragged.id ? targetParentId : c.parent_id,
            }
          : c
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
      const debtCard = !card && debtId ? debtById.get(debtId) : null;
      const cardName = card?.name ?? debtCard?.name ?? "Credit Card";
      return `Credit Card Payment - ${cardName}`;
    }

    if (cat?.group_name === "debt") {
      const debt = debtId ? debtById.get(debtId) : null;
      const debtName = debt?.name ?? "Debt";
      return `Debt Payment - ${debtName}`;
    }

    return catName;
  }

  function validateDateInput(
    value: string,
    options: { allowEmpty?: boolean } = {}
  ): string {
    if (!value) {
      return options.allowEmpty ? "" : "Date is required.";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return "Use a valid date.";
    }
    const [yStr, mStr, dStr] = value.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    const day = Number(dStr);
    if (year < 2000 || year > 2100) return "Date must be between 2000 and 2100.";
    if (month < 1 || month > 12) return "Use a valid date.";
    const maxDay = new Date(year, month, 0).getDate();
    if (day < 1 || day > maxDay) return "Use a valid date.";
    return "";
  }

  async function addTxn() {
    setMsg("");
    try {
      if (!userId) return;
      const amt = Number(txnAmount);
      const dateErr = validateDateInput(txnDate);
      setTxnDateError(dateErr);
      if (dateErr) throw new Error(dateErr);
      if (!Number.isFinite(amt)) throw new Error("Enter a valid amount.");
      if (!txnCategoryId) throw new Error("Pick a category.");
      const cardSelection = txnNeedsCard ? parseCardSelectId(txnCardSelectId) : null;
      if (txnNeedsCard && !cardSelection) throw new Error("Select a credit card.");
      if (txnNeedsDebtAccount && !txnDebtAccountId) throw new Error("Select a debt account.");

      const computedName = fallbackTxnName(
        txnCategoryId,
        cardSelection?.kind === "card" ? cardSelection.id : null,
        txnDescription,
        cardSelection?.kind === "debt" ? cardSelection.id : txnNeedsDebtAccount ? txnDebtAccountId : null
      );

      const payload: any = {
        user_id: userId,
        source: "manual",
        date: txnDate,
        name: computedName,
        amount: amt,
        category_id: txnCategoryId,
        is_pending: false,
        credit_card_id: cardSelection?.kind === "card" ? cardSelection.id : null,
        debt_account_id:
          txnNeedsDebtAccount ? txnDebtAccountId : cardSelection?.kind === "debt" ? cardSelection.id : null,
      };

      const { error } = await supabase.from("transactions").insert([payload]);
      if (error) throw error;

      if (txnDebtAccountId) {
        await adjustDebtBalance(txnDebtAccountId, -amt);
      } else if (cardSelection?.kind === "debt") {
        await adjustDebtBalance(cardSelection.id, -amt);
      }

      saveTxnFormDefaults({
        categoryId: txnCategoryId,
        cardSelectId: txnCardSelectId,
        debtAccountId: txnDebtAccountId,
      });

      setTxnAmount("");
      setTxnCardSelectId("");
      setTxnDateError("");
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
    setEditTxnDateError("");
    setEditTxnAmount(String(t.amount));
    setEditTxnCategoryId(t.category_id ?? "");
    setEditTxnDebtAccountId(t.debt_account_id ?? "");
    setEditTxnDescription(t.name ?? "");
    if (t.category_id && creditCardCategoryIds.includes(t.category_id)) {
      if (t.credit_card_id) setEditTxnCardSelectId(`card:${t.credit_card_id}`);
      else if (t.debt_account_id) setEditTxnCardSelectId(`debt:${t.debt_account_id}`);
      else setEditTxnCardSelectId("");
    } else {
      setEditTxnCardSelectId("");
    }
  }

  function cancelEditTxn() {
    setEditTxnId(null);
    setEditTxnDate("");
    setEditTxnDateError("");
    setEditTxnAmount("");
    setEditTxnCategoryId("");
    setEditTxnCardSelectId("");
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
      const dateErr = validateDateInput(editTxnDate);
      setEditTxnDateError(dateErr);
      if (dateErr) throw new Error(dateErr);
      if (!Number.isFinite(amt)) throw new Error("Enter a valid amount.");
      if (!editTxnCategoryId) throw new Error("Pick a category.");
      const cardSelection = editTxnNeedsCard ? parseCardSelectId(editTxnCardSelectId) : null;
      if (editTxnNeedsCard && !cardSelection) throw new Error("Select a credit card.");
      if (editTxnNeedsDebtAccount && !editTxnDebtAccountId)
        throw new Error("Select a debt account.");

      const newName = fallbackTxnName(
        editTxnCategoryId,
        cardSelection?.kind === "card" ? cardSelection.id : null,
        editTxnDescription,
        cardSelection?.kind === "debt" ? cardSelection.id : editTxnNeedsDebtAccount ? editTxnDebtAccountId : null
      );

      const payload: any = {
        date: editTxnDate,
        name: newName,
        amount: amt,
        category_id: editTxnCategoryId,
        credit_card_id: cardSelection?.kind === "card" ? cardSelection.id : null,
        debt_account_id:
          editTxnNeedsDebtAccount
            ? editTxnDebtAccountId
            : cardSelection?.kind === "debt"
            ? cardSelection.id
            : null,
      };

      const oldRequiresCard =
        !!t.category_id && creditCardCategoryIds.includes(t.category_id);
      const newRequiresCard = editTxnNeedsCard;

      const oldCardId = t.credit_card_id ?? null;
      const newCardId = payload.credit_card_id ?? null;

      const oldRequiresDebt = !!t.debt_account_id;
      const newRequiresDebt = !!payload.debt_account_id;

      const oldDebtId = t.debt_account_id ?? null;
      const newDebtId = payload.debt_account_id ?? null;

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
                credit_card_id: payload.credit_card_id,
                debt_account_id: payload.debt_account_id,
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
      confirmActionRef.current = async () => {
        const oldRequiresCard =
          !!t.category_id && creditCardCategoryIds.includes(t.category_id);
        const oldCardId = t.credit_card_id ?? null;

        const oldRequiresDebt =
          !!t.category_id &&
          !creditCardCategoryIds.includes(t.category_id) &&
          categoryById.get(t.category_id)?.group_name === "debt";
        const oldDebtId = t.debt_account_id ?? null;

        const { error } = await supabase
          .from("transactions")
          .delete()
          .eq("id", t.id);
        if (error) throw error;

        if (oldRequiresCard && oldCardId) {
          await adjustCardBalance(oldCardId, t.amount);
        }

        if (oldRequiresDebt && oldDebtId) {
          await adjustDebtBalance(oldDebtId, t.amount);
        }

        setTxns((prev) => prev.filter((x) => x.id !== t.id));
        setMsg("Transaction deleted.");
      };
      setConfirmState({
        open: true,
        title: "Delete transaction?",
        body: "This cannot be undone.",
      });
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function deleteDebtAccount(debt: DebtAccount) {
    setMsg("");
    try {
      if (!userId) return;
      confirmActionRef.current = async () => {
        const { error } = await supabase
          .from("debt_accounts")
          .delete()
          .eq("id", debt.id);
        if (error) throw error;

        const { error: planErr } = await supabase
          .from("planned_items")
          .delete()
          .eq("debt_account_id", debt.id);
        if (planErr) throw planErr;

        setDebtAccounts((prev) => prev.filter((d) => d.id !== debt.id));
        setPlanRows((prev) => prev.filter((p) => p.debt_account_id !== debt.id));
        setTxns((prev) =>
          prev.map((t) =>
            t.debt_account_id === debt.id ? { ...t, debt_account_id: null } : t
          )
        );
        setMsg("Debt account deleted.");
      };
      setConfirmState({
        open: true,
        title: "Delete debt account?",
        body: "Transactions will remain but no longer be linked.",
      });
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  const availableStartNum = useMemo(() => {
    const n = Number(availableStart);
    return Number.isFinite(n) ? n : 0;
  }, [availableStart]);

  const leftToBudget = availableStartNum + plannedNet;

  const availableEnd = useMemo(() => {
    return availableStartNum + plannedIncome - plannedOut;
  }, [availableStartNum, plannedIncome, plannedOut]);

  useEffect(() => {
    syncBudgetMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, monthKey, plannedIncome, plannedOut]);

  // Sections
  const incomeCats = categories.filter((c) => c.group_name === "income");
  const givingCats = categories.filter((c) => c.group_name === "giving");
  const savingsCats = categories.filter((c) => c.group_name === "savings");
  const expenseCats = categories.filter((c) => c.group_name === "expense");

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

  function buildFlatRows(list: Category[]) {
    return list
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((c) => {
        const v = rowForCategory(c.id);
        const isDefault = isDefaultCategory(c);
        const isTopLevel = c.parent_id === null;
        const canDelete = !(isDefault && isTopLevel);
        return {
          id: `CAT::${c.id}`,
          label: c.name,
          planned: v.planned,
          actual: v.actual,
          remaining: v.remaining,
          editable: true,
          indent: 0,
          orderableCategoryId: c.id,
          deletableCategoryId: canDelete ? c.id : undefined,
          mobileDraggable: !(isDefault && isTopLevel),
        } as BudgetRow;
      });
  }

  function buildCategoryGroups(list: Category[]) {
    const childrenByParent = childrenByParentFor(list);
    const parents = list
      .filter((c) => c.parent_id === null)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    const groups = parents.map((p) => {
      const isDefaultParent = isDefaultCategory(p);
      const kids = childrenByParent.get(p.id) ?? [];

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
        const isDefault = isDefaultCategory(k);
        const canDelete = !(isDefault && k.parent_id === null);
        return {
          id: `CAT::${k.id}`,
          label: k.name,
          planned: v.planned,
          actual: v.actual,
          remaining: v.remaining,
          editable: true,
          indent: 0,
          orderableCategoryId: k.id,
          deletableCategoryId: canDelete ? k.id : undefined,
          mobileDraggable: true,
        };
      });
      return {
        id: p.id,
        label: p.name,
        totals,
        rows,
        deletable: !isDefaultParent,
        mobileDraggable: !isDefaultParent,
      };
    });

    const ungrouped = parents
      .filter((p) => (childrenByParent.get(p.id) ?? []).length === 0)
      .map((p) => {
        const v = rowForCategory(p.id);
        const isDefault = isDefaultCategory(p);
        const isTopLevel = p.parent_id === null;
        const canDelete = !(isDefault && isTopLevel);
        return {
          id: `CAT::${p.id}`,
          label: p.name,
          planned: v.planned,
          actual: v.actual,
          remaining: v.remaining,
          editable: true,
          indent: 0,
          orderableCategoryId: p.id,
          deletableCategoryId: canDelete ? p.id : undefined,
          mobileDraggable: !(isDefault && isTopLevel),
        } as BudgetRow;
      });

    return { groups, ungrouped };
  }

  function totalsForRows(rows: BudgetRow[]) {
    return rows.reduce(
      (acc, r) => {
        acc.planned += r.planned;
        acc.actual += r.actual;
        acc.remaining += r.remaining;
        return acc;
      },
      { planned: 0, actual: 0, remaining: 0 }
    );
  }

  function rowForCategory(catId: string) {
    const key = `${catId}::none`;
    const planned = plannedMap.get(key) ?? 0;
    const actual = actualMap.get(key) ?? 0;
    const remaining = planned - actual;
    return { planned, actual, remaining };
  }

  // Build section rows
  const incomeRows = buildFlatRows(incomeCats);
  const givingRows = buildFlatRows(givingCats);
  const savingsRows = buildFlatRows(savingsCats);
  const expenseGrouped = buildCategoryGroups(expenseCats);
  const incomeTotals = totalsForRows(incomeRows);
  const givingTotals = totalsForRows(givingRows);
  const savingsTotals = totalsForRows(savingsRows);
  const expenseTotals = expenseGrouped.groups.reduce(
    (acc, g) => {
      acc.planned += g.totals.planned;
      acc.actual += g.totals.actual;
      acc.remaining += g.totals.remaining;
      return acc;
    },
    { planned: 0, actual: 0, remaining: 0 }
  );

  // Debt:
  // - per-card credit card payments (bucketed from ANY "credit card*" debt category)
  // - other debt categories shown normally, excluding the "credit card*" categories to avoid double-counting
  const debtRows = Array.from(
    new Map(debtAccounts.map((d) => [d.id, d])).values()
  ).map((d) => {
    const key = `DEBT::${d.id}`;
    const ccKey = `CC::${d.id}`;
    const plannedDirect = plannedMap.get(key);
    const plannedCc = d.debt_type === "credit_card" ? plannedMap.get(ccKey) : undefined;
    const planned =
      plannedDirect ??
      plannedCc ??
      (d.min_payment === null ? 0 : Number(d.min_payment));
    const actualDirect = actualMap.get(key);
    const actualCc = d.debt_type === "credit_card" ? actualMap.get(ccKey) : undefined;
    const actual = actualDirect ?? actualCc ?? 0;
    const remaining = planned - actual;
    return {
      id: key,
      label: d.name,
      extra: (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {debtTypeLabel(d.debt_type)}
          </span>
          <span>Balance {formatMoney(d.balance)}</span>
          <span>Min {d.min_payment === null ? "--" : formatMoney(d.min_payment)}</span>
          <span>APR {d.apr === null ? "--" : `${d.apr}%`}</span>
          <span>Due {d.due_date ?? "--"}</span>
        </div>
      ),
      planned,
      actual,
      remaining,
      editable: true,
      indent: 0,
      orderableCategoryId: undefined,
      deletableCategoryId: undefined,
    };
  });
  const debtTotals = totalsForRows(debtRows);


  async function signOutUser() {
    setMsg("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      writeAuthCookie(null);
      router.replace("/login");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  return (
    <AuthGate>
      <main className="mx-auto mt-6 w-full max-w-6xl px-4 sm:mt-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <h1 className="text-3xl font-bold brand-text">Budget</h1>
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              | {monthLabel}
            </span>
          </div>

          <div className="relative z-50">
            <button
              onClick={() => setHeaderMenuOpen((v) => !v)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              aria-label="Open menu"
            >
              ...
            </button>

            {headerMenuOpen && (
              <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                <label className="grid gap-1 p-2 text-xs text-zinc-600 dark:text-zinc-300">
                  Month
                  <select
                    value={monthOffset}
                    onChange={(e) => {
                      setMonthOffset(Number(e.target.value));
                      setHeaderMenuOpen(false);
                    }}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value={0}>This month</option>
                    <option value={-1}>Last month</option>
                  </select>
                </label>

                <div className="mt-2 grid gap-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                  <button
                    onClick={() => {
                      loadAll();
                      setHeaderMenuOpen(false);
                    }}
                    className="rounded-md px-2 py-2 text-left text-sm text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                  <button
                    onClick={() => {
                      setShowDebug((v) => !v);
                      setHeaderMenuOpen(false);
                    }}
                    className="rounded-md px-2 py-2 text-left text-sm text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Debug: {showDebug ? "On" : "Off"}
                  </button>
                  <button
                    onClick={() => {
                      signOutUser();
                      setHeaderMenuOpen(false);
                    }}
                    className="rounded-md px-2 py-2 text-left text-sm text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
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
          <div className="mt-4 rounded-md border brand-border brand-panel p-3 text-sm text-zinc-900 dark:text-zinc-100">
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

        <div className="sticky top-0 z-20 rounded-lg border brand-border brand-sticky backdrop-blur px-2">
          <div className="py-3">
            <div className="md:hidden">
              <div className="rounded-lg border border-t-4 brand-top-border brand-border brand-panel p-3">
                <div className="text-sm text-zinc-700 dark:text-zinc-300">Left to budget</div>
                <div className="mt-2 text-2xl font-semibold brand-text">
                  {formatMoney(leftToBudget)}
                </div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Rollover start + planned income - planned outflows
                </div>
              </div>
            </div>

            <div className="hidden gap-3 md:grid md:grid-cols-2">
              <div className="rounded-lg border border-t-4 brand-top-border brand-border brand-panel p-4">
                <div className="text-sm text-zinc-700 dark:text-zinc-300">Left to budget</div>
                <div className="mt-2 text-2xl font-semibold brand-text">
                  {formatMoney(leftToBudget)}
                </div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Rollover start + planned income - planned outflows
                </div>
              </div>

              <div className="rounded-lg border border-t-4 brand-top-border brand-border brand-panel p-4">
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
            </div>
          </div>
        </div>

        <div className="mt-6">

            <Section
              title="Income"
              header={
                <SectionTotals
                  planned={incomeTotals.planned}
                  actual={incomeTotals.actual}
                  remaining={incomeTotals.remaining}
                  actualLabel="Received"
                  remainingLabel="Difference"
                />
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
                editNameId={editCategoryId}
                editNameValue={editCategoryName}
                setEditNameValue={setEditCategoryName}
                onStartEditName={startEditCategoryName}
                onSaveName={saveCategoryName}
                onCancelName={cancelEditCategoryName}
                setDragCategoryId={setDragCategoryId}
                onDeleteCategory={removeCategory}
                plannedLabel="Planned"
                actualLabel="Received"
                remainingLabel="Difference"
              />
              <div className="mt-1 flex flex-wrap items-end gap-2 sm:mt-3">
                {addIncomeOpen ? (
                  <>
                    <input
                      value={newGroupName.income}
                      onChange={(e) =>
                        setNewGroupName((prev) => ({ ...prev, income: e.target.value }))
                      }
                      placeholder="Add income category"
                      className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      onClick={async () => {
                        if (!newGroupName.income.trim()) {
                          setMsg("Enter a category name.");
                          return;
                        }
                        await addGroup("income");
                        setAddIncomeOpen(false);
                      }}
                      className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setNewGroupName((prev) => ({ ...prev, income: "" }));
                        setAddIncomeOpen(false);
                      }}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setAddIncomeOpen(true)}
                    className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Add
                  </button>
                )}
              </div>
            </Section>

            <Section
              title="Giving"
              header={
                <SectionTotals
                  planned={givingTotals.planned}
                  actual={givingTotals.actual}
                  remaining={givingTotals.remaining}
                  actualLabel="Spent"
                  remainingLabel="Remaining"
                />
              }
            >
              <BudgetTable
                rows={givingRows}
                onDrop={onDropCategory}
                editPlannedKey={editPlannedKey}
                editPlannedAmount={editPlannedAmount}
                setEditPlannedAmount={setEditPlannedAmount}
                onSavePlanned={updatePlannedTotal}
                onCancelPlanned={cancelEditPlanned}
                onStartEditPlanned={startEditPlanned}
                editNameId={editCategoryId}
                editNameValue={editCategoryName}
                setEditNameValue={setEditCategoryName}
                onStartEditName={startEditCategoryName}
                onSaveName={saveCategoryName}
                onCancelName={cancelEditCategoryName}
                setDragCategoryId={setDragCategoryId}
                onDeleteCategory={removeCategory}
                plannedLabel="Planned"
                actualLabel="Spent"
                remainingLabel="Remaining"
              />
              <div className="mt-1 flex flex-wrap items-end gap-2 sm:mt-3">
                {addGivingOpen ? (
                  <>
                    <input
                      value={newGroupName.giving}
                      onChange={(e) =>
                        setNewGroupName((prev) => ({ ...prev, giving: e.target.value }))
                      }
                      placeholder="Add giving category"
                      className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      onClick={async () => {
                        if (!newGroupName.giving.trim()) {
                          setMsg("Enter a category name.");
                          return;
                        }
                        await addGroup("giving");
                        setAddGivingOpen(false);
                      }}
                      className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setNewGroupName((prev) => ({ ...prev, giving: "" }));
                        setAddGivingOpen(false);
                      }}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setAddGivingOpen(true)}
                    className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Add
                  </button>
                )}
              </div>
            </Section>

            <Section
              title="Savings"
              header={
                <SectionTotals
                  planned={savingsTotals.planned}
                  actual={savingsTotals.actual}
                  remaining={savingsTotals.remaining}
                  actualLabel="Received"
                  remainingLabel="Difference"
                />
              }
            >
              <BudgetTable
                rows={savingsRows}
                onDrop={onDropCategory}
                editPlannedKey={editPlannedKey}
                editPlannedAmount={editPlannedAmount}
                setEditPlannedAmount={setEditPlannedAmount}
                onSavePlanned={updatePlannedTotal}
                onCancelPlanned={cancelEditPlanned}
                onStartEditPlanned={startEditPlanned}
                editNameId={editCategoryId}
                editNameValue={editCategoryName}
                setEditNameValue={setEditCategoryName}
                onStartEditName={startEditCategoryName}
                onSaveName={saveCategoryName}
                onCancelName={cancelEditCategoryName}
                setDragCategoryId={setDragCategoryId}
                onDeleteCategory={removeCategory}
                plannedLabel="Planned"
                actualLabel="Received"
                remainingLabel="Difference"
              />
              <div className="mt-1 flex flex-wrap items-end gap-2 sm:mt-3">
                {addSavingsOpen ? (
                  <>
                    <input
                      value={newGroupName.savings}
                      onChange={(e) =>
                        setNewGroupName((prev) => ({ ...prev, savings: e.target.value }))
                      }
                      placeholder="Add savings category"
                      className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      onClick={async () => {
                        if (!newGroupName.savings.trim()) {
                          setMsg("Enter a category name.");
                          return;
                        }
                        await addGroup("savings");
                        setAddSavingsOpen(false);
                      }}
                      className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setNewGroupName((prev) => ({ ...prev, savings: "" }));
                        setAddSavingsOpen(false);
                      }}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setAddSavingsOpen(true)}
                    className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Add
                  </button>
                )}
              </div>
            </Section>

            <Section
              title="Expenses"
              header={
                <SectionTotals
                  planned={expenseTotals.planned}
                  actual={expenseTotals.actual}
                  remaining={expenseTotals.remaining}
                  actualLabel="Spent"
                  remainingLabel="Remaining"
                />
              }
            >
              <div className="grid gap-2 sm:gap-4">
                {expenseGrouped.groups.map((group) => (
                  <SwipeRow
                    key={group.id}
                    enabled={!!group.deletable && !groupTouchDraggingId}
                    onDelete={() => {
                      if (!group.deletable) return;
                      removeCategory(group.id);
                    }}
                    deleteLabel="Delete group"
                  >
                    <div
                      data-dnd-id={group.id}
                      className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950 sm:p-3"
                      draggable
                      onTouchStart={(e) => {
                        if (!group.mobileDraggable) return;
                        startGroupTouchDrag(e, group.id);
                      }}
                      onTouchMove={moveGroupTouchDrag}
                      onTouchEnd={endGroupTouchDrag}
                      onTouchCancel={endGroupTouchDrag}
                      onDragStart={(e) => {
                        setDragCategoryId(group.id);
                        e.dataTransfer.setData("text/plain", group.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragCategoryId(null)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const draggedId = e.dataTransfer.getData("text/plain");
                        if (draggedId) setDragCategoryId(draggedId);
                        onDropCategory(group.id, draggedId || null);
                      }}
                    >
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 sm:gap-3"
                      onContextMenu={
                        group.deletable
                          ? (e) => {
                              e.preventDefault();
                              removeCategory(group.id);
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-2">
                        {editCategoryId === group.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={editCategoryName}
                              onChange={(e) => setEditCategoryName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveCategoryName(group.id);
                                if (e.key === "Escape") cancelEditCategoryName();
                              }}
                              autoFocus
                              className="w-[200px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            />
                            <button
                              onClick={() => saveCategoryName(group.id)}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEditCategoryName}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => startEditCategoryName(group.id, group.label)}
                              className="rounded-md text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-100 hover:underline dark:text-zinc-100 dark:hover:bg-zinc-800"
                              title="Edit group name"
                            >
                              {group.label}
                            </button>
                            <button
                              onClick={() => startEditCategoryName(group.id, group.label)}
                              className="rounded-md px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:hidden"
                              aria-label={`Edit ${group.label}`}
                              title="Edit group name"
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      Planned {formatMoney(group.totals.planned)} - Spent{" "}
                      {formatMoney(group.totals.actual)} - Remaining{" "}
                      <span className={remainingColorClass(group.totals.remaining)}>
                        {formatMoney(group.totals.remaining)}
                      </span>
                      </div>
                    </div>
                    <div className="mt-1 sm:mt-3">
                      <BudgetTable
                        rows={group.rows}
                        onDrop={onDropCategory}
                        editPlannedKey={editPlannedKey}
                        editPlannedAmount={editPlannedAmount}
                        setEditPlannedAmount={setEditPlannedAmount}
                        onSavePlanned={updatePlannedTotal}
                        onCancelPlanned={cancelEditPlanned}
                        onStartEditPlanned={startEditPlanned}
                        editNameId={editCategoryId}
                        editNameValue={editCategoryName}
                        setEditNameValue={setEditCategoryName}
                        onStartEditName={startEditCategoryName}
                        onSaveName={saveCategoryName}
                        onCancelName={cancelEditCategoryName}
                        setDragCategoryId={setDragCategoryId}
                        onDeleteCategory={removeCategory}
                        plannedLabel="Planned"
                        actualLabel="Spent"
                        remainingLabel="Remaining"
                      />
                  </div>
                  <div className="mt-1 flex flex-wrap items-end gap-2 sm:mt-3">
                    {addChildOpenId === group.id ? (
                      <>
                        <input
                          value={newChildName[group.id] ?? ""}
                          onChange={(e) =>
                            setNewChildName((prev) => ({
                              ...prev,
                              [group.id]: e.target.value,
                            }))
                          }
                          placeholder="Add category"
                          className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                        <button
                          onClick={async () => {
                            if (!(newChildName[group.id] ?? "").trim()) {
                              setMsg("Enter a category name.");
                              return;
                            }
                            await addChildCategory("expense", group.id);
                            setAddChildOpenId(null);
                          }}
                          className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setNewChildName((prev) => ({ ...prev, [group.id]: "" }));
                            setAddChildOpenId(null);
                          }}
                          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setAddChildOpenId(group.id)}
                        className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Add
                      </button>
                    )}
                  </div>
                    </div>
                  </SwipeRow>
                ))}
            </div>
              <div className="mt-2 flex flex-wrap items-end gap-2 sm:mt-4">
                {addExpenseGroupOpen ? (
                  <>
                    <input
                      value={newGroupName.expense}
                      onChange={(e) =>
                        setNewGroupName((prev) => ({ ...prev, expense: e.target.value }))
                      }
                      placeholder="Add expense group"
                      className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      onClick={async () => {
                        if (!newGroupName.expense.trim()) {
                          setMsg("Enter a group name.");
                          return;
                        }
                        await addGroup("expense");
                        setAddExpenseGroupOpen(false);
                      }}
                      className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setNewGroupName((prev) => ({ ...prev, expense: "" }));
                        setAddExpenseGroupOpen(false);
                      }}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setAddExpenseGroupOpen(true)}
                    className="btn-brand rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Add Group
                  </button>
                )}
              </div>
            </Section>

            <Section
              title="Debt"
              header={
                <SectionTotals
                  planned={debtTotals.planned}
                  actual={debtTotals.actual}
                  remaining={debtTotals.remaining}
                  actualLabel="Paid"
                  remainingLabel="Remaining"
                />
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
                editNameId={editCategoryId}
                editNameValue={editCategoryName}
                setEditNameValue={setEditCategoryName}
                onStartEditName={startEditCategoryName}
                onSaveName={saveCategoryName}
                onCancelName={cancelEditCategoryName}
                setDragCategoryId={setDragCategoryId}
                onDeleteCategory={removeCategory}
                plannedLabel="Planned"
                actualLabel="Paid"
                remainingLabel="Remaining"
              />
            </Section>



            <section className="mt-8 hidden">
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full border-collapse text-sm">
                  <thead className="brand-table-head text-zinc-900 dark:text-zinc-100">
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
                                <div className="grid gap-1">
                                  <input
                                    type="date"
                                    value={editTxnDate}
                                    min="2000-01-01"
                                    max="2100-12-31"
                                    onChange={(e) => {
                                      if (e.target.value.length > 10) return;
                                      setEditTxnDate(e.target.value);
                                      if (editTxnDateError) setEditTxnDateError("");
                                    }}
                                    onBlur={() =>
                                      setEditTxnDateError(validateDateInput(editTxnDate))
                                    }
                                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                  />
                                  {editTxnDateError && (
                                    <div className="text-xs text-red-600 dark:text-red-400">
                                      {editTxnDateError}
                                    </div>
                                  )}
                                </div>
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
                                  {(["income", "giving", "savings", "expense", "debt"] as const).map((group) => {
                                    const groupCats = categories.filter((c) => c.group_name === group);
                                    if (groupCats.length === 0) return null;
                                    return (
                                      <optgroup
                                        key={group}
                                        label={group.charAt(0).toUpperCase() + group.slice(1)}
                                      >
                                        {(() => {
                                          const parents = groupCats
                                            .filter((c) => c.parent_id === null)
                                            .slice()
                                            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
                                          const childrenByParent = new Map<string, Category[]>();
                                          for (const c of groupCats) {
                                            if (!c.parent_id) continue;
                                            if (!childrenByParent.has(c.parent_id)) childrenByParent.set(c.parent_id, []);
                                            childrenByParent.get(c.parent_id)!.push(c);
                                          }
                                          for (const [k, arr] of childrenByParent.entries()) {
                                            arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
                                            childrenByParent.set(k, arr);
                                          }
                                          const opts: ReactElement[] = [];
                                          for (const p of parents) {
                                            const kids = childrenByParent.get(p.id) ?? [];
                                            if (kids.length) {
                                              for (const k of kids) {
                                                opts.push(
                                                  <option key={k.id} value={k.id}>
                                                    {p.name} / {k.name}
                                                  </option>
                                                );
                                              }
                                            } else {
                                              opts.push(
                                                <option key={p.id} value={p.id}>
                                                  {p.name}
                                                </option>
                                              );
                                            }
                                          }
                                          return opts;
                                        })()}
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
                                    value={editTxnCardSelectId}
                                    onChange={(e) => setEditTxnCardSelectId(e.target.value)}
                                    className="min-w-[180px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                  >
                                    <option value="">Select a card</option>
                                    {cardLikeAccounts.map((cc) => (
                                      <option key={`${cc.kind}:${cc.id}`} value={`${cc.kind}:${cc.id}`}>
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
      </main>
    </AuthGate>
  );
}
  function parseCardSelectId(value: string) {
    if (!value) return null;
    if (value.startsWith("card:")) return { kind: "card" as const, id: value.slice(5) };
    if (value.startsWith("debt:")) return { kind: "debt" as const, id: value.slice(5) };
    return null;
  }
