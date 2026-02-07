import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Action = "insert" | "update" | "delete";

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  group_name: string;
};

async function fetchCategory(
  supabase: any,
  categoryId: string
): Promise<CategoryRow | null> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id, group_name")
    .eq("id", categoryId)
    .single();
  if (error || !data) return null;
  return data as CategoryRow;
}

async function isCreditCardCategory(
  supabase: any,
  categoryId: string
): Promise<boolean> {
  const cat = await fetchCategory(supabase, categoryId);
  if (!cat) return false;
  if (cat.group_name !== "debt") return false;
  if (cat.name.toLowerCase().includes("credit card")) return true;
  if (cat.parent_id) {
    const parent = await fetchCategory(supabase, cat.parent_id);
    return !!parent && parent.name.toLowerCase().includes("credit card");
  }
  return false;
}

async function adjustCreditCard(
  supabase: any,
  cardId: string,
  delta: number
) {
  const { data, error } = await supabase
    .from("credit_cards")
    .select("current_balance")
    .eq("id", cardId)
    .single();
  if (error || !data) throw new Error("Credit card not found.");
  const next = Number(data.current_balance) + delta;
  const { error: upErr } = await supabase
    .from("credit_cards")
    .update({ current_balance: next })
    .eq("id", cardId);
  if (upErr) throw upErr;
}

async function adjustDebt(
  supabase: any,
  debtId: string,
  delta: number
) {
  const { data, error } = await supabase
    .from("debt_accounts")
    .select("balance")
    .eq("id", debtId)
    .single();
  if (error || !data) throw new Error("Debt account not found.");
  const next = Number(data.balance) + delta;
  const { error: upErr } = await supabase
    .from("debt_accounts")
    .update({ balance: next })
    .eq("id", debtId);
  if (upErr) throw upErr;
}

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

    if (action === "insert") {
      const date = typeof body?.date === "string" ? body.date : "";
      const name = typeof body?.name === "string" ? body.name : "";
      const amount = Number(body?.amount);
      const categoryId =
        typeof body?.category_id === "string" ? body.category_id : "";
      const creditCardId =
        typeof body?.credit_card_id === "string" ? body.credit_card_id : null;
      const debtAccountId =
        typeof body?.debt_account_id === "string" ? body.debt_account_id : null;

      if (!date || !name || !categoryId || !Number.isFinite(amount)) {
        return NextResponse.json(
          { error: "Date, name, category, and amount are required." },
          { status: 400 }
        );
      }

      const cat = await fetchCategory(supabase, categoryId);
      if (!cat) {
        return NextResponse.json({ error: "Category not found." }, { status: 400 });
      }
      const isCc = await isCreditCardCategory(supabase, categoryId);

      if (cat.group_name !== "debt" && (creditCardId || debtAccountId)) {
        return NextResponse.json(
          { error: "Invalid payment mapping for non-debt category." },
          { status: 400 }
        );
      }
      if (isCc) {
        if (!creditCardId && !debtAccountId) {
          return NextResponse.json(
            { error: "Select a credit card." },
            { status: 400 }
          );
        }
      } else if (cat.group_name === "debt") {
        if (!debtAccountId) {
          return NextResponse.json(
            { error: "Select a debt account." },
            { status: 400 }
          );
        }
        if (creditCardId) {
          return NextResponse.json(
            { error: "Credit card only allowed for credit card categories." },
            { status: 400 }
          );
        }
      }

      const { data, error } = await supabase
        .from("transactions")
        .insert([
          {
            user_id: user.id,
            source: "manual",
            date,
            name,
            amount,
            category_id: categoryId,
            is_pending: false,
            credit_card_id: creditCardId,
            debt_account_id: debtAccountId,
          },
        ])
        .select("id, category_id, credit_card_id, debt_account_id, amount, date, name")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (creditCardId) await adjustCreditCard(supabase, creditCardId, -amount);
      if (debtAccountId) await adjustDebt(supabase, debtAccountId, -amount);

      const response = NextResponse.json({ transaction: data }, { status: 200 });
      applyCookies(response);
      return response;
    }

    if (action === "update") {
      const id = typeof body?.id === "string" ? body.id : "";
      const date = typeof body?.date === "string" ? body.date : "";
      const name = typeof body?.name === "string" ? body.name : "";
      const amount = Number(body?.amount);
      const categoryId =
        typeof body?.category_id === "string" ? body.category_id : "";
      const creditCardId =
        typeof body?.credit_card_id === "string" ? body.credit_card_id : null;
      const debtAccountId =
        typeof body?.debt_account_id === "string" ? body.debt_account_id : null;

      if (!id || !date || !name || !categoryId || !Number.isFinite(amount)) {
        return NextResponse.json(
          { error: "Id, date, name, category, and amount are required." },
          { status: 400 }
        );
      }

      const { data: existing, error: existingErr } = await supabase
        .from("transactions")
        .select("id, amount, category_id, credit_card_id, debt_account_id")
        .eq("id", id)
        .single();
      if (existingErr || !existing) {
        return NextResponse.json({ error: "Transaction not found." }, { status: 400 });
      }

      const cat = await fetchCategory(supabase, categoryId);
      if (!cat) {
        return NextResponse.json({ error: "Category not found." }, { status: 400 });
      }
      const isCc = await isCreditCardCategory(supabase, categoryId);

      if (cat.group_name !== "debt" && (creditCardId || debtAccountId)) {
        return NextResponse.json(
          { error: "Invalid payment mapping for non-debt category." },
          { status: 400 }
        );
      }
      if (isCc) {
        if (!creditCardId && !debtAccountId) {
          return NextResponse.json(
            { error: "Select a credit card." },
            { status: 400 }
          );
        }
      } else if (cat.group_name === "debt") {
        if (!debtAccountId) {
          return NextResponse.json(
            { error: "Select a debt account." },
            { status: 400 }
          );
        }
        if (creditCardId) {
          return NextResponse.json(
            { error: "Credit card only allowed for credit card categories." },
            { status: 400 }
          );
        }
      }

      const { error } = await supabase
        .from("transactions")
        .update({
          date,
          name,
          amount,
          category_id: categoryId,
          credit_card_id: creditCardId,
          debt_account_id: debtAccountId,
        })
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (existing.credit_card_id) {
        await adjustCreditCard(
          supabase,
          existing.credit_card_id,
          Number(existing.amount)
        );
      }
      if (existing.debt_account_id) {
        await adjustDebt(supabase, existing.debt_account_id, Number(existing.amount));
      }

      if (creditCardId) await adjustCreditCard(supabase, creditCardId, -amount);
      if (debtAccountId) await adjustDebt(supabase, debtAccountId, -amount);

      const response = NextResponse.json(
        {
          transaction: {
            id,
            date,
            name,
            amount,
            category_id: categoryId,
            credit_card_id: creditCardId,
            debt_account_id: debtAccountId,
          },
        },
        { status: 200 }
      );
      applyCookies(response);
      return response;
    }

    if (action === "delete") {
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) {
        return NextResponse.json({ error: "Id is required." }, { status: 400 });
      }
      const { data: existing, error: existingErr } = await supabase
        .from("transactions")
        .select("id, amount, credit_card_id, debt_account_id")
        .eq("id", id)
        .single();
      if (existingErr || !existing) {
        return NextResponse.json({ error: "Transaction not found." }, { status: 400 });
      }

      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (existing.credit_card_id) {
        await adjustCreditCard(
          supabase,
          existing.credit_card_id,
          Number(existing.amount)
        );
      }
      if (existing.debt_account_id) {
        await adjustDebt(supabase, existing.debt_account_id, Number(existing.amount));
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
