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
      const { data: userData } = await supabase.auth.getUser();
      if (!mounted) return;

      if (!userData.user) {
        router.replace("/login");
        return;
      }

      setReady(true);
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
