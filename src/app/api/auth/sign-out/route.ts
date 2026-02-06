import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";

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

  await supabase.auth.signOut();
  const response = NextResponse.json({ ok: true }, { status: 200 });
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
