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
      const apr = body?.apr === null || body?.apr === "" ? null : Number(body?.apr);
      const currentBalance = Number(body?.current_balance ?? 0);
      const minPayment =
        body?.min_payment === null || body?.min_payment === ""
          ? null
          : Number(body?.min_payment);

      if (!name || !Number.isFinite(currentBalance)) {
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
        .from("credit_cards")
        .insert([
          {
            user_id: user.id,
            name,
            apr,
            current_balance: currentBalance,
            min_payment: minPayment,
          },
        ])
        .select("id, name, apr, current_balance, min_payment")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const response = NextResponse.json({ creditCard: data }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "update") {
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) {
        return NextResponse.json({ error: "Id is required." }, { status: 400 });
      }

      const patch: Record<string, any> = {};
      if (typeof body?.name === "string") patch.name = body.name;
      if (body?.apr === null || typeof body?.apr === "number") patch.apr = body.apr;
      if (typeof body?.current_balance === "number")
        patch.current_balance = body.current_balance;
      if (body?.min_payment === null || typeof body?.min_payment === "number")
        patch.min_payment = body.min_payment;

      const { data, error } = await supabase
        .from("credit_cards")
        .update(patch)
        .eq("id", id)
        .select("id, name, apr, current_balance, min_payment")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const response = NextResponse.json({ creditCard: data }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "delete") {
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) {
        return NextResponse.json({ error: "Id is required." }, { status: 400 });
      }
      const { error } = await supabase.from("credit_cards").delete().eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
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
      .from("credit_cards")
      .select("id, name, apr, current_balance, min_payment")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const response = NextResponse.json({ creditCards: data ?? [] }, { status: 200 });
    applyCookies(response);
    return response;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error." },
      { status: 500 }
    );
  }
}
