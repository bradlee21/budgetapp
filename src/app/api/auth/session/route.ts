import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";

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

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  const response = NextResponse.json({ session: data.session }, { status: 200 });
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
