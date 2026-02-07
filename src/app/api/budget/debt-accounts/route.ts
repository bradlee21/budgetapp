import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Action = "create" | "update" | "delete";

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
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const debtType = typeof body?.debt_type === "string" ? body.debt_type : "credit_card";
      const balance = Number(body?.balance ?? 0);
      const apr = body?.apr === null || body?.apr === "" ? null : Number(body?.apr);
      const minPayment =
        body?.min_payment === null || body?.min_payment === ""
          ? null
          : Number(body?.min_payment);
      const dueDate = typeof body?.due_date === "string" ? body.due_date : null;

      if (!name || !Number.isFinite(balance)) {
        return NextResponse.json(
          { error: "Name and valid balance are required." },
          { status: 400 }
        );
      }
      if (apr !== null && !Number.isFinite(apr)) {
        return NextResponse.json({ error: "APR must be a number." }, { status: 400 });
      }
      if (minPayment !== null && !Number.isFinite(minPayment)) {
        return NextResponse.json(
          { error: "Min payment must be a number." },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("debt_accounts")
        .insert([
          {
            user_id: user.id,
            name,
            debt_type: debtType,
            balance,
            apr,
            min_payment: minPayment,
            due_date: dueDate,
          },
        ])
        .select("id, name, debt_type, balance, apr, min_payment, due_date")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const response = NextResponse.json({ debtAccount: data }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "update") {
      const id = typeof body?.id === "string" ? body.id : "";
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const debtType = typeof body?.debt_type === "string" ? body.debt_type : "credit_card";
      const balance = Number(body?.balance ?? 0);
      const apr = body?.apr === null || body?.apr === "" ? null : Number(body?.apr);
      const minPayment =
        body?.min_payment === null || body?.min_payment === ""
          ? null
          : Number(body?.min_payment);
      const dueDate = typeof body?.due_date === "string" ? body.due_date : null;

      if (!id || !name || !Number.isFinite(balance)) {
        return NextResponse.json(
          { error: "Id, name, and valid balance are required." },
          { status: 400 }
        );
      }
      if (apr !== null && !Number.isFinite(apr)) {
        return NextResponse.json({ error: "APR must be a number." }, { status: 400 });
      }
      if (minPayment !== null && !Number.isFinite(minPayment)) {
        return NextResponse.json(
          { error: "Min payment must be a number." },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("debt_accounts")
        .update({
          name,
          debt_type: debtType,
          balance,
          apr,
          min_payment: minPayment,
          due_date: dueDate,
        })
        .eq("id", id)
        .select("id, name, debt_type, balance, apr, min_payment, due_date")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const response = NextResponse.json({ debtAccount: data }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "delete") {
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) {
        return NextResponse.json({ error: "Id is required." }, { status: 400 });
      }
      const { error } = await supabase.from("debt_accounts").delete().eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const { error: planErr } = await supabase
        .from("planned_items")
        .delete()
        .eq("debt_account_id", id);
      if (planErr) {
        return NextResponse.json({ error: planErr.message }, { status: 500 });
      }
      const response = NextResponse.json({ ok: true }, { status: 200 });
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

export async function GET(request: NextRequest) {
  try {
    const { supabase, applyCookies } = createSupabaseServerClient(request);
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("debt_accounts")
      .select("id, name, debt_type, balance, apr, min_payment, due_date")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const response = NextResponse.json({ debtAccounts: data ?? [] }, { status: 200 });
    applyCookies(response);
    return response;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error." },
      { status: 500 }
    );
  }
}
