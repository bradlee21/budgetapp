"use client";

import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";

type Category = {
  id: string;
  user_id?: string;
  group_name: "income" | "expense" | "debt" | "misc";
  name: string;
  parent_id: string | null;
};

type CreditCard = {
  id: string;
  name: string;
  current_balance: number;
};

type PlanType = "income" | "expense" | "debt";

type PlanItem = {
  id: string;
  month: string; // YYYY-MM-01
  type: PlanType;
  category_id: string;
  credit_card_id: string | null;
  name: string;
  amount: number;
};

function firstDayOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, m: number) {
  return new Date(d.getFullYear(), d.getMonth() + m, 1);
}
function toMonthKey(d: Date) {
  return firstDayOfMonth(d).toISOString().slice(0, 10);
}

function normalizeName(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

export default function PlanPage() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [items, setItems] = useState<PlanItem[]>([]);

  const [monthOffset, setMonthOffset] = useState<number>(0);

  // Add planned item form
  const [formType, setFormType] = useState<PlanType>("expense");
  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [formCardId, setFormCardId] = useState<string>("");

  // Category editor UI
  const [showCategoryEditor, setShowCategoryEditor] = useState(false);
  const [newCatGroup, setNewCatGroup] = useState<Category["group_name"]>("income");
  const [newCatParentId, setNewCatParentId] = useState<string>(""); // "" => none
  const [newCatName, setNewCatName] = useState("");
  const [catMsg, setCatMsg] = useState("");
  const [catBusyId, setCatBusyId] = useState<string | null>(null);

  const monthKey = useMemo(() => {
    const d = addMonths(new Date(), monthOffset);
    return toMonthKey(d);
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

  // helper: children by parent
  const childrenByParent = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of categories) {
      if (!c.parent_id) continue;
      if (!m.has(c.parent_id)) m.set(c.parent_id, []);
      m.get(c.parent_id)!.push(c);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
      m.set(k, arr);
    }
    return m;
  }, [categories]);

  const hasChildren = (catId: string) => (childrenByParent.get(catId)?.length ?? 0) > 0;

  // Category list shown depends on type
  const filteredCategories = useMemo(() => {
    const wantedGroup =
      formType === "income" ? "income" : formType === "expense" ? "expense" : "debt";
    return categories.filter((c) => c.group_name === wantedGroup);
  }, [categories, formType]);

  const selectedCategory = useMemo(() => {
    if (!formCategoryId) return null;
    return categoryById.get(formCategoryId) ?? null;
  }, [formCategoryId, categoryById]);

  // Any DEBT category containing "credit card" requires selecting a card
  const needsCard = useMemo(() => {
    if (!selectedCategory) return false;
    if (selectedCategory.group_name !== "debt") return false;
    return selectedCategory.name.toLowerCase().includes("credit card");
  }, [selectedCategory]);

  // If you switch type, clear dependent fields
  useEffect(() => {
    setFormCategoryId("");
    setFormCardId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formType]);

  // If category no longer requires a card, clear card selection
  useEffect(() => {
    if (!needsCard) setFormCardId("");
  }, [needsCard]);

  const plannedIncome = useMemo(
    () => items.filter((it) => it.type === "income").reduce((sum, it) => sum + Number(it.amount), 0),
    [items]
  );
  const plannedExpense = useMemo(
    () => items.filter((it) => it.type === "expense").reduce((sum, it) => sum + Number(it.amount), 0),
    [items]
  );
  const plannedDebt = useMemo(
    () => items.filter((it) => it.type === "debt").reduce((sum, it) => sum + Number(it.amount), 0),
    [items]
  );

  async function loadCategories() {
    const { data, error } = await supabase
      .from("categories")
      .select("id, group_name, name, parent_id")
      .order("group_name", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;
    setCategories((data ?? []) as Category[]);
  }

  async function loadCards() {
    const { data, error } = await supabase
      .from("credit_cards")
      .select("id, name, current_balance")
      .order("name", { ascending: true });

    if (error) throw error;

    setCards(
      (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        current_balance: Number(c.current_balance),
      }))
    );
  }

  async function loadPlanForMonth(month: string) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("planned_items")
      .select("id, month, type, category_id, credit_card_id, name, amount")
      .eq("user_id", user.id)
      .eq("month", month)
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    setItems(
      ((data ?? []) as any[]).map((it) => ({
        ...it,
        amount: Number(it.amount),
      }))
    );
  }

  async function refresh() {
    setMsg("");
    setCatMsg("");
    setLoading(true);
    try {
      await loadCategories();
      await loadCards();
      await loadPlanForMonth(monthKey);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  // Build select options where parents are headers (disabled) and children selectable
  function buildCategoryOptions(list: Category[]) {
    const byId = categoryById;

    // parents: categories that have children in this filtered list
    const parents = list
      .filter((c) => !c.parent_id && hasChildren(c.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    const children = list.filter((c) => !!c.parent_id);

    // children under their parent
    const childGroups = new Map<string, Category[]>();
    for (const c of children) {
      const pid = c.parent_id!;
      // only show children if parent is in same group (sanity)
      const p = byId.get(pid);
      if (!p) continue;
      if (!childGroups.has(pid)) childGroups.set(pid, []);
      childGroups.get(pid)!.push(c);
    }
    for (const [pid, arr] of childGroups.entries()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
      childGroups.set(pid, arr);
    }

    const topLevelSelectable = list
      .filter((c) => !c.parent_id && !hasChildren(c.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    // return a flat render plan
    const render: Array<
      | { kind: "option"; cat: Category; disabled?: boolean; labelOverride?: string }
    > = [];

    // parents (disabled) with children under them
    for (const p of parents) {
      render.push({ kind: "option", cat: p, disabled: true, labelOverride: p.name });
      const kids = childGroups.get(p.id) ?? [];
      for (const k of kids) {
        render.push({
          kind: "option",
          cat: k,
          disabled: false,
          labelOverride: `  ${k.name}`, // indent
        });
      }
    }

    // remaining top-level selectable categories
    for (const c of topLevelSelectable) {
      render.push({ kind: "option", cat: c, disabled: false, labelOverride: c.name });
    }

    return render;
  }

  const filteredCategoryOptions = useMemo(() => {
    return buildCategoryOptions(filteredCategories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCategories, childrenByParent]);

  // For category editor: parents are those in group with no parent
  const editorParents = useMemo(() => {
    return categories
      .filter((c) => c.group_name === newCatGroup && c.parent_id === null)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, newCatGroup]);

  const editorUnparented = useMemo(() => {
    return categories
      .filter((c) => c.group_name === newCatGroup && c.parent_id === null && !hasChildren(c.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, newCatGroup, childrenByParent]);

  const editorTree = useMemo(() => {
    const parents = categories
      .filter((c) => c.group_name === newCatGroup && c.parent_id === null && hasChildren(c.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    const tree = parents.map((p) => ({
      parent: p,
      children: (childrenByParent.get(p.id) ?? []).filter((ch) => ch.group_name === newCatGroup),
    }));

    return tree;
  }, [categories, newCatGroup, childrenByParent]);

  async function addCategory() {
    setCatMsg("");
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const name = normalizeName(newCatName);
      if (!name) throw new Error("Enter a category name.");

      const parentId = newCatParentId ? newCatParentId : null;

      // Prevent duplicates at same level (same group + same parent_id)
      const exists = categories.some(
        (c) =>
          c.group_name === newCatGroup &&
          (c.parent_id ?? null) === (parentId ?? null) &&
          c.name.toLowerCase() === name.toLowerCase()
      );
      if (exists) throw new Error("That category already exists in this parent.");

      // Safety: parent must be same group (and unparented)
      if (parentId) {
        const p = categoryById.get(parentId);
        if (!p) throw new Error("Parent not found.");
        if (p.group_name !== newCatGroup) throw new Error("Parent must be in the same group.");
        if (p.parent_id) throw new Error("Only one nesting level is allowed (parent cannot have a parent).");
      }

      const { data, error } = await supabase
        .from("categories")
        .insert([
          {
            user_id: u.user.id,          // IMPORTANT for RLS
            group_name: newCatGroup,
            name,
            parent_id: parentId,
          },
        ])
        .select("id, group_name, name, parent_id")
        .single();

      if (error) throw error;

      const next = [...categories, data as Category].sort((a, b) => {
        if (a.group_name !== b.group_name) return a.group_name.localeCompare(b.group_name);
        return a.name.localeCompare(b.name);
      });

      setCategories(next);
      setCatMsg(`Added "${name}".`);
      setNewCatName("");
      setNewCatParentId(""); // default back to none
    } catch (e: any) {
      setCatMsg(e?.message ?? String(e));
    }
  }

  async function deleteCategory(cat: Category) {
    setCatMsg("");

    // block deleting parent with children
    if (hasChildren(cat.id)) {
      setCatMsg(`"${cat.name}" has sub-categories. Delete or move its children first (or we can add archive later).`);
      return;
    }

    const ok = confirm(`Delete category "${cat.name}"? This cannot be undone.`);
    if (!ok) return;

    setCatBusyId(cat.id);
    try {
      const { error } = await supabase.from("categories").delete().eq("id", cat.id);
      if (error) throw error;

      setCategories((prev) => prev.filter((c) => c.id !== cat.id));

      if (formCategoryId === cat.id) setFormCategoryId("");

      setCatMsg(`Deleted "${cat.name}".`);
    } catch (e: any) {
      setCatMsg(
        e?.message ??
          `Couldn't delete "${cat.name}". It may be used by planned items or transactions.`
      );
    } finally {
      setCatBusyId(null);
    }
  }

  async function addPlannedItem() {
    setMsg("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const amt = Number(formAmount);

      if (!formName.trim()) throw new Error("Enter a name.");
      if (!Number.isFinite(amt)) throw new Error("Enter a valid amount.");
      if (amt <= 0) throw new Error("Amount must be greater than 0.");
      if (!formCategoryId) throw new Error("Pick a category.");

      const cat = categoryById.get(formCategoryId);
      if (!cat) throw new Error("Category not found.");

      if (hasChildren(cat.id)) throw new Error("Pick a sub-category (parent categories are headers).");

      const expectedGroup =
        formType === "income" ? "income" : formType === "expense" ? "expense" : "debt";
      if (cat.group_name !== expectedGroup) {
        throw new Error(`That category belongs to "${cat.group_name}", not "${expectedGroup}".`);
      }

      if (needsCard && !formCardId) {
        throw new Error("Select a credit card for this planned item.");
      }

      const payload: any = {
        user_id: user.id,
        month: monthKey,
        type: formType,
        category_id: formCategoryId,
        credit_card_id: needsCard ? formCardId : null,
        name: formName.trim(),
        amount: amt,
      };

      const { error } = await supabase.from("planned_items").insert([payload]);
      if (error) throw error;

      setFormName("");
      setFormAmount("");
      setMsg("Added planned item.");
      await loadPlanForMonth(monthKey);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function deletePlannedItem(id: string) {
    setMsg("");
    try {
      const { error } = await supabase.from("planned_items").delete().eq("id", id);
      if (error) throw error;
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  return (
    <AuthGate>
      <main className="mx-auto mt-10 max-w-5xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Plan</h1>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{monthLabel}</p>
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
              onClick={refresh}
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

        {/* Summary */}
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">Planned income</div>
            <div className="mt-1 text-2xl font-semibold">${plannedIncome.toFixed(2)}</div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">Planned expenses</div>
            <div className="mt-1 text-2xl font-semibold">${plannedExpense.toFixed(2)}</div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">Planned debt payments</div>
            <div className="mt-1 text-2xl font-semibold">${plannedDebt.toFixed(2)}</div>
          </div>
        </section>

        {/* Add planned item */}
        <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Add planned item</h2>

            <button
              onClick={() => {
                setCatMsg("");
                setNewCatGroup("income");
                setNewCatParentId("");
                setNewCatName("");
                setShowCategoryEditor((v) => !v);
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              {showCategoryEditor ? "Close category editor" : "Manage categories"}
            </button>
          </div>

          {/* Category editor */}
          {showCategoryEditor && (
            <div className="mt-4 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Group</span>
                  <select
                    value={newCatGroup}
                    onChange={(e) => {
                      setNewCatGroup(e.target.value as Category["group_name"]);
                      setNewCatParentId("");
                    }}
                    className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                    <option value="debt">Debt</option>
                    <option value="misc">Misc</option>
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Parent (optional)</span>
                  <select
                    value={newCatParentId}
                    onChange={(e) => setNewCatParentId(e.target.value)}
                    className="min-w-[220px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="">None</option>
                    {editorParents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">New category name</span>
                  <input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="VA Benefits, Utilities, Internet…"
                    className="min-w-[260px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <button
                  onClick={addCategory}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  Add category
                </button>
              </div>

              {catMsg && (
                <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{catMsg}</div>
              )}

              {/* Category list w/ delete */}
              <div className="mt-4">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {newCatGroup.toUpperCase()} categories
                </div>

                <div className="mt-2 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
                  {editorTree.length === 0 && editorUnparented.length === 0 ? (
                    <div className="p-3 text-sm text-zinc-600 dark:text-zinc-300">
                      No categories in this group yet.
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-zinc-950">
                      {/* parent groups */}
                      {editorTree.map(({ parent, children }) => (
                        <div key={parent.id} className="border-b border-zinc-200 dark:border-zinc-800">
                          <div className="flex items-center justify-between p-3">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {parent.name}
                            </div>
                            <button
                              disabled={catBusyId === parent.id}
                              onClick={() => deleteCategory(parent)}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                            >
                              {catBusyId === parent.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>

                          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {children.map((c) => (
                              <li
                                key={c.id}
                                className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100"
                              >
                                <span className="pl-4">{c.name}</span>
                                <button
                                  disabled={catBusyId === c.id}
                                  onClick={() => deleteCategory(c)}
                                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                                >
                                  {catBusyId === c.id ? "Deleting…" : "Delete"}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}

                      {/* unparented selectable categories */}
                      {editorUnparented.length > 0 && (
                        <div>
                          <div className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                            No parent
                          </div>
                          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {editorUnparented.map((c) => (
                              <li
                                key={c.id}
                                className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100"
                              >
                                <span>{c.name}</span>
                                <button
                                  disabled={catBusyId === c.id}
                                  onClick={() => deleteCategory(c)}
                                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                                >
                                  {catBusyId === c.id ? "Deleting…" : "Delete"}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  If a category is already used by planned items or transactions, Supabase may block deletion.
                  In that case, we can add an “archive” feature later.
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Type</span>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as PlanType)}
                className="rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="debt">Debt</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Category</span>
              <select
                value={formCategoryId}
                onChange={(e) => setFormCategoryId(e.target.value)}
                className="min-w-[220px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">
                  {filteredCategories.length ? "Choose category" : "No categories yet"}
                </option>
                {filteredCategoryOptions.map((opt) => (
                  <option
                    key={opt.cat.id}
                    value={opt.cat.id}
                    disabled={!!opt.disabled}
                  >
                    {opt.labelOverride ?? opt.cat.name}
                  </option>
                ))}
              </select>
            </label>

            {needsCard && (
              <label className="grid gap-1">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">Credit card</span>
                <select
                  value={formCardId}
                  onChange={(e) => setFormCardId(e.target.value)}
                  className="min-w-[220px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="">Select a card</option>
                  {cards.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.name} (bal ${cc.current_balance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Name</span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Rent, Paycheck, Capital One payment…"
                className="min-w-[240px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Amount</span>
              <input
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                inputMode="decimal"
                placeholder="120"
                className="w-[140px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <button
              onClick={addPlannedItem}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Add
            </button>
          </div>

          <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            Tip: Parent categories are headers only. Select a sub-category when available.
          </div>
        </section>

        {/* Planned items list */}
        <section className="mt-8">
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                <tr>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Category</th>
                  <th className="p-3 text-left">Card</th>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3"></th>
                </tr>
              </thead>

              <tbody className="bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                {items.length === 0 ? (
                  <tr>
                    <td className="p-3 text-zinc-600 dark:text-zinc-300" colSpan={6}>
                      No planned items for this month.
                    </td>
                  </tr>
                ) : (
                  items.map((it) => {
                    const cat = categoryById.get(it.category_id);
                    const card = it.credit_card_id ? cardById.get(it.credit_card_id) : null;

                    return (
                      <tr key={it.id} className="border-t border-zinc-200 dark:border-zinc-800">
                        <td className="p-3 capitalize">{it.type}</td>
                        <td className="p-3">{cat?.name ?? "—"}</td>
                        <td className="p-3">{card?.name ?? "—"}</td>
                        <td className="p-3 font-medium">{it.name}</td>
                        <td className="p-3 text-right tabular-nums">
                          ${Number(it.amount).toFixed(2)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => deletePlannedItem(it.id)}
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
        </section>
      </main>
    </AuthGate>
  );
}
