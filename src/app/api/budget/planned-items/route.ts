import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Action = "update" | "deleteMany" | "insert";

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

    if (action === "update") {
      const id = typeof body?.id === "string" ? body.id : "";
      const amount = Number(body?.amount);
      if (!id || !Number.isFinite(amount)) {
        return NextResponse.json(
          { error: "Valid id and amount are required." },
          { status: 400 }
        );
      }
      const { data, error } = await supabase
        .from("planned_items")
        .update({ amount })
        .eq("id", id)
        .select("id, type, category_id, credit_card_id, debt_account_id, name, amount")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const response = NextResponse.json({ plannedItem: data }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "deleteMany") {
      const ids = Array.isArray(body?.ids) ? body.ids : [];
      if (!ids.length) {
        return NextResponse.json({ error: "Ids are required." }, { status: 400 });
      }
      const { error } = await supabase.from("planned_items").delete().in("id", ids);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const response = NextResponse.json({ ok: true }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "insert") {
      const month = typeof body?.month === "string" ? body.month : "";
      const type = typeof body?.type === "string" ? body.type : "";
      const categoryId =
        typeof body?.category_id === "string" ? body.category_id : "";
      const name = typeof body?.name === "string" ? body.name : "Planned total";
      const amount = Number(body?.amount);
      const creditCardId =
        typeof body?.credit_card_id === "string" ? body.credit_card_id : null;
      const debtAccountId =
        typeof body?.debt_account_id === "string" ? body.debt_account_id : null;

      if (!month || !type || !categoryId || !Number.isFinite(amount)) {
        return NextResponse.json(
          { error: "Month, type, category, and amount are required." },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("planned_items")
        .insert([
          {
            user_id: user.id,
            month,
            type,
            category_id: categoryId,
            credit_card_id: creditCardId,
            debt_account_id: debtAccountId,
            name,
            amount,
          },
        ])
        .select("id, type, category_id, credit_card_id, debt_account_id, name, amount")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const response = NextResponse.json({ plannedItem: data }, { status: 200 });
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
