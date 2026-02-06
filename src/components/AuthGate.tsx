"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (!mounted) return;
        const session = data?.session;
        if (!session?.access_token || !session?.refresh_token) {
          router.replace("/login");
          return;
        }
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        setReady(true);
      } catch {
        router.replace("/login");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="mx-auto mt-10 max-w-md px-4 text-zinc-700 dark:text-zinc-300">
        Checking session...
      </div>
    );
  }

  return <>{children}</>;
}
