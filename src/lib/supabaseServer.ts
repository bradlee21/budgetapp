import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type CookieQueueItem = { name: string; value: string; options: CookieOptions };

export function createSupabaseServerClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase env vars are missing.");
  }

  const cookieQueue: CookieQueueItem[] = [];

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

  function applyCookies(response: NextResponse) {
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
  }

  return { supabase, applyCookies };
}
