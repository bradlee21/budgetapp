import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Action =
  | "create"
  | "rename"
  | "archive"
  | "restore"
  | "delete"
  | "reorder"
  | "seedDefaults"
  | "ensureCreditCardCategory";

export async function POST(request: NextRequest) {
  try {
    const { supabase, applyCookies } = createSupabaseServerClient(request);
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action: Action = body?.action;

    if (!action) {
      return NextResponse.json({ error: "Action is required." }, { status: 400 });
    }

    if (action === "create") {
      const group = body?.group as string | undefined;
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const parentId =
        typeof body?.parentId === "string" ? body.parentId : null;
      if (!group || !name) {
        return NextResponse.json(
          { error: "Group and name are required." },
          { status: 400 }
        );
      }

      if (parentId) {
        const { data: parent, error: parentErr } = await supabase
          .from("categories")
          .select("id, group_name, parent_id")
          .eq("id", parentId)
          .single();
        if (parentErr || !parent) {
          return NextResponse.json(
            { error: "Parent not found." },
            { status: 400 }
          );
        }
        if (parent.group_name !== group) {
          return NextResponse.json(
            { error: "Parent must be in the same section." },
            { status: 400 }
          );
        }
        if (parent.parent_id) {
          return NextResponse.json(
            { error: "Parent cannot have a parent." },
            { status: 400 }
          );
        }
      }

      const { data: siblings, error: siblingsErr } = await supabase
        .from("categories")
        .select("sort_order")
        .eq("group_name", group)
        .eq("parent_id", parentId);
      if (siblingsErr) {
        return NextResponse.json({ error: siblingsErr.message }, { status: 500 });
      }
      const maxOrder = (siblings ?? []).reduce(
        (m, s: any) => Math.max(m, s.sort_order ?? 0),
        0
      );

      const { data, error } = await supabase
        .from("categories")
        .insert([
          {
            user_id: user.id,
            group_name: group,
            name,
            parent_id: parentId,
            sort_order: maxOrder + 1,
          },
        ])
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const response = NextResponse.json({ category: data }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "rename") {
      const id = typeof body?.id === "string" ? body.id : "";
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!id || !name) {
        return NextResponse.json(
          { error: "Category id and name are required." },
          { status: 400 }
        );
      }
      const { data, error } = await supabase
        .from("categories")
        .update({ name })
        .eq("id", id)
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const response = NextResponse.json({ category: data }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "archive" || action === "restore") {
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) {
        return NextResponse.json(
          { error: "Category id is required." },
          { status: 400 }
        );
      }
      const { data, error } = await supabase
        .from("categories")
        .update({ is_archived: action === "archive" })
        .eq("id", id)
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const response = NextResponse.json({ category: data }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "delete") {
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) {
        return NextResponse.json(
          { error: "Category id is required." },
          { status: 400 }
        );
      }
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const response = NextResponse.json({ ok: true }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "reorder") {
      const updates = Array.isArray(body?.updates) ? body.updates : [];
      if (!updates.length) {
        return NextResponse.json(
          { error: "Updates are required." },
          { status: 400 }
        );
      }
      const results = await Promise.all(
        updates.map((u: any) =>
          supabase
            .from("categories")
            .update({
              sort_order: Number(u.sort_order),
              parent_id: u.parent_id ?? undefined,
            })
            .eq("id", u.id)
        )
      );
      const err = results.find((r) => r.error)?.error;
      if (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
      const response = NextResponse.json({ ok: true }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "seedDefaults") {
      const flatDefaults: Array<{ group: string; names: string[] }> = [
        { group: "income", names: ["Primary Income", "Other Income"] },
        { group: "giving", names: ["Tithe", "Charity"] },
        {
          group: "savings",
          names: ["Emergency Fund", "Sinking Fund", "Long-Term Savings"],
        },
        { group: "debt", names: ["Credit Card", "Debt Payment"] },
      ];

      const expenseGroups: Array<{ name: string; children: string[] }> = [
        { name: "Housing", children: ["Rent/Mortgage", "Utilities", "Internet"] },
        { name: "Transportation", children: ["Gas", "Maintenance", "Insurance"] },
        { name: "Food", children: ["Groceries", "Restaurants"] },
        { name: "Lifestyle", children: ["Entertainment", "Subscriptions"] },
        { name: "Health", children: ["Medical", "Pharmacy"] },
        { name: "Personal", children: ["Clothing", "Personal Care"] },
        { name: "Insurance", children: ["Health", "Auto", "Home/Renters"] },
      ];

      const parentPayload = [
        ...flatDefaults.flatMap((d) =>
          d.names.map((name, idx) => ({
            user_id: user.id,
            group_name: d.group,
            name,
            parent_id: null,
            sort_order: idx + 1,
          }))
        ),
        ...expenseGroups.map((g, idx) => ({
          user_id: user.id,
          group_name: "expense",
          name: g.name,
          parent_id: null,
          sort_order: idx + 1,
        })),
      ];

      const { data: parentData, error: parentErr } = await supabase
        .from("categories")
        .insert(parentPayload)
        .select("id, group_name, name, parent_id, sort_order, is_archived");

      if (parentErr && parentErr.code !== "23505") {
        return NextResponse.json({ error: parentErr.message }, { status: 500 });
      }

      const parentByName = new Map<string, any>();
      for (const p of parentData ?? []) {
        if (p.group_name === "expense") parentByName.set(p.name, p);
      }

      const childPayload = expenseGroups.flatMap((g) => {
        const parent = parentByName.get(g.name);
        if (!parent) return [];
        return g.children.map((name, idx) => ({
          user_id: user.id,
          group_name: "expense",
          name,
          parent_id: parent.id,
          sort_order: idx + 1,
        }));
      });

      if (childPayload.length) {
        const { error: childErr } = await supabase
          .from("categories")
          .insert(childPayload)
          .select("id, group_name, name, parent_id, sort_order, is_archived");
        if (childErr && childErr.code !== "23505") {
          return NextResponse.json({ error: childErr.message }, { status: 500 });
        }
      }

      const { data: cats, error: catsErr } = await supabase
        .from("categories")
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .or("is_archived.is.null,is_archived.eq.false")
        .order("group_name", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (catsErr) {
        return NextResponse.json({ error: catsErr.message }, { status: 500 });
      }

      const response = NextResponse.json({ categories: cats ?? [] }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "ensureCreditCardCategory") {
      const { data: debtCats, error: debtErr } = await supabase
        .from("categories")
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .eq("group_name", "debt");
      if (debtErr) {
        return NextResponse.json({ error: debtErr.message }, { status: 500 });
      }

      const byId = new Map<string, any>();
      for (const c of debtCats ?? []) {
        byId.set(c.id, c);
      }

      const existing = (debtCats ?? []).find((c) => {
        const name = String(c.name ?? "").toLowerCase();
        if (name.includes("credit card")) return true;
        if (c.parent_id) {
          const parent = byId.get(c.parent_id);
          return String(parent?.name ?? "").toLowerCase().includes("credit card");
        }
        return false;
      });

      if (existing) {
        const response = NextResponse.json({ category: existing }, { status: 200 });
        applyCookies(response);
        return response;
      }

      const maxOrder = (debtCats ?? []).reduce(
        (m, c: any) => Math.max(m, c.sort_order ?? 0),
        0
      );

      const { data, error } = await supabase
        .from("categories")
        .insert([
          {
            user_id: user.id,
            group_name: "debt",
            name: "Credit Card",
            parent_id: null,
            sort_order: maxOrder + 1,
          },
        ])
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const response = NextResponse.json({ category: data }, { status: 200 });
      applyCookies(response);
      return response;
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error." },
      { status: 500 }
    );
  }
}
