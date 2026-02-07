import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const cookieQueue: Array<{
    name: string;
    value: string;
    options: CookieOptions;
  }> = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase env vars are missing." },
      { status: 500 }
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieQueue.push({ name, value, options });
      },
      remove(name: string, options: CookieOptions) {
        cookieQueue.push({
          name,
          value: "",
          options: { ...options, maxAge: 0 },
        });
      },
    },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!month || !start || !end) {
    return NextResponse.json(
      { error: "Missing month/start/end params." },
      { status: 400 }
    );
  }

  const [cats, archived, cards, debts, plan, txns, budgetMonth] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .or("is_archived.is.null,is_archived.eq.false")
        .order("group_name", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("categories")
        .select("id, group_name, name, parent_id, sort_order, is_archived")
        .eq("is_archived", true)
        .order("group_name", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("credit_cards")
        .select("id, name, current_balance")
        .order("name", { ascending: true }),
      supabase
        .from("debt_accounts")
        .select("id, name, debt_type, balance, apr, min_payment, due_date")
        .order("name", { ascending: true }),
      supabase
        .from("planned_items")
        .select("id, type, category_id, credit_card_id, debt_account_id, name, amount")
        .eq("user_id", user.id)
        .eq("month", month),
      supabase
        .from("transactions")
        .select("id, category_id, credit_card_id, debt_account_id, amount, date, name")
        .eq("user_id", user.id)
        .gte("date", start)
        .lt("date", end),
      supabase
        .from("budget_months")
        .select("id, user_id, month, available_start, available_end")
        .eq("user_id", user.id)
        .eq("month", month)
        .maybeSingle(),
    ]);

  const error =
    cats.error ||
    archived.error ||
    cards.error ||
    debts.error ||
    plan.error ||
    txns.error ||
    budgetMonth.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response = NextResponse.json(
    {
      userId: user.id,
      categories: cats.data ?? [],
      archivedCategories: archived.data ?? [],
      creditCards: cards.data ?? [],
      debtAccounts: debts.data ?? [],
      plannedItems: plan.data ?? [],
      transactions: txns.data ?? [],
      budgetMonth: budgetMonth.data ?? null,
    },
    { status: 200 }
  );

  cookieQueue.forEach(({ name, value, options }) => {
    response.cookies.set({
      name,
      value,
      ...options,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  });

  return response;
}
