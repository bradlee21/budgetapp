import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

function prevMonthKey(month: string) {
  const d = new Date(`${month}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const month = typeof body?.month === "string" ? body.month : "";
  if (!month) {
    return NextResponse.json({ error: "Month is required." }, { status: 400 });
  }

  const plannedIncome = Number(body?.plannedIncome ?? 0);
  const plannedOut = Number(body?.plannedOut ?? 0);
  const availableStartOverride = body?.availableStart;

  const { data: existing, error: existingErr } = await supabase
    .from("budget_months")
    .select("id, user_id, month, available_start, available_end")
    .eq("user_id", user.id)
    .eq("month", month)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  let availableStart =
    availableStartOverride !== undefined && availableStartOverride !== null
      ? Number(availableStartOverride)
      : existing?.available_start;

  if (availableStart === undefined || availableStart === null) {
    const prevMonth = prevMonthKey(month);
    if (prevMonth) {
      const { data: prevRow, error: prevErr } = await supabase
        .from("budget_months")
        .select("available_end")
        .eq("user_id", user.id)
        .eq("month", prevMonth)
        .maybeSingle();
      if (prevErr) {
        return NextResponse.json({ error: prevErr.message }, { status: 500 });
      }
      availableStart = prevRow?.available_end ?? 0;
    } else {
      availableStart = 0;
    }
  }

  const availableEnd = Number(availableStart) + plannedIncome - plannedOut;

  const { data: up, error: upErr } = await supabase
    .from("budget_months")
    .upsert(
      {
        user_id: user.id,
        month,
        available_start: Number(availableStart),
        available_end: availableEnd,
      },
      { onConflict: "user_id,month" }
    )
    .select("id, user_id, month, available_start, available_end")
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const response = NextResponse.json({ budgetMonth: up }, { status: 200 });
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
