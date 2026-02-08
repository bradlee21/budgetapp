"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");

  async function checkUser() {
    const res = await fetch("/api/auth/user", {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.user) {
      setUser(data.user as User);
      return true;
    }
    return false;
  }

  useEffect(() => {
    (async () => {
      await checkUser();
    })();
  }, []);

  useEffect(() => {
    if (user) {
      router.replace("/budget");
    }
  }, [user, router]);

  async function signUp() {
    setMsg("");
    try {
      if (!email || !password) throw new Error("Enter email + password first.");
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error ?? "Sign-up failed.");
      const ok = await checkUser();
      if (ok) {
        router.replace("/budget");
        return;
      }
      setMsg("Sign-up successful. If email confirmation is ON, check your inbox.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function signIn() {
    setMsg("");
    try {
      if (!email || !password) throw new Error("Enter email + password first.");
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error ?? "Sign-in failed.");
      const ok = await checkUser();
      if (ok) {
        router.replace("/budget");
        return;
      }
      router.replace("/budget");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  return (
    <main className="mx-auto mt-10 max-w-md px-4 text-sm">
      <h1 className="text-2xl font-bold">Login</h1>

      <div className="mt-6 grid gap-3">
        <label className="grid gap-1">
          <span className="text-zinc-700 dark:text-zinc-300">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white p-2 text-base text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="you@example.com"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-zinc-700 dark:text-zinc-300">Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            className="rounded-md border border-zinc-300 bg-white p-2 text-base text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="--------"
          />
        </label>

        <div className="mt-2 flex gap-2">
          <button
            onClick={signUp}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Sign up
          </button>
          <button
            onClick={signIn}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Sign in
          </button>
        </div>

        {msg && (
          <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {msg}
          </div>
        )}
      </div>
    </main>
  );
}
