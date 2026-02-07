import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/manifest.webmanifest", "/sw.js"];

const PUBLIC_FILE_REGEX =
  /\.(?:css|js|map|json|txt|png|jpg|jpeg|svg|ico|webmanifest)$/i;

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/sw.js") ||
    PUBLIC_FILE_REGEX.test(pathname) ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({
          name,
          value,
          ...options,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({
          name,
          value: "",
          ...options,
          maxAge: 0,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authed = !!user;

  if (isPublicPath(pathname)) {
    if (authed) {
      const url = request.nextUrl.clone();
      url.pathname = "/budget";
      url.searchParams.delete("next");
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
    return response;
  }

  if (!authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/|api/|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:css|js|map|json|txt|png|jpg|jpeg|svg|ico|webmanifest)$).*)",
  ],
};
