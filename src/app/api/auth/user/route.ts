import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET(request: NextRequest) {
  try {
    const { supabase, applyCookies } = createSupabaseServerClient(request);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: error?.message ?? "Unauthorized" }, { status: 401 });
    }
    const response = NextResponse.json({ user }, { status: 200 });
    applyCookies(response);
    return response;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error." },
      { status: 500 }
    );
  }
}
