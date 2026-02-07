"use client";

import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";

type CreditCard = {
  id: string;
  name: string;
  apr: number | null;
  current_balance: number;
  min_payment: number | null;
};

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export default function DebtPage() {
  const [msg, setMsg] = useState("");
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [apr, setApr] = useState("");
  const [balance, setBalance] = useState("");
  const [minPay, setMinPay] = useState("");

  const totalBalance = useMemo(
    () => cards.reduce((s, c) => s + n(c.current_balance), 0),
    [cards]
  );

  async function loadCards() {
    setMsg("");
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const { data, error } = await supabase
        .from("credit_cards")
        .select("id, name, apr, current_balance, min_payment")
        .order("name", { ascending: true });

      if (error) throw error;

      setCards(
        (data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          apr: c.apr === null ? null : Number(c.apr),
          current_balance: Number(c.current_balance),
          min_payment: c.min_payment === null ? null : Number(c.min_payment),
        }))
      );
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function addCard() {
    setMsg("");
    try {
      const nm = name.trim();
      if (!nm) throw new Error("Enter a card name.");

      const payload = {
        name: nm,
        apr: apr.trim() === "" ? null : Number(apr),
        current_balance: balance.trim() === "" ? 0 : Number(balance),
        min_payment: minPay.trim() === "" ? null : Number(minPay),
      };

      if (payload.apr !== null && !Number.isFinite(payload.apr))
        throw new Error("APR must be a number.");
      if (!Number.isFinite(payload.current_balance))
        throw new Error("Current balance must be a number.");
      if (payload.min_payment !== null && !Number.isFinite(payload.min_payment))
        throw new Error("Min payment must be a number.");

      const res = await fetch("/api/budget/credit-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "create",
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to add credit card.");

      setName("");
      setApr("");
      setBalance("");
      setMinPay("");
      setMsg("Added credit card.");
      await loadCards();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function updateCard(id: string, patch: Partial<CreditCard>) {
    setMsg("");
    try {
      const res = await fetch("/api/budget/credit-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "update",
          id,
          name: patch.name,
          apr: patch.apr,
          current_balance: patch.current_balance,
          min_payment: patch.min_payment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to update credit card.");
      if (data?.creditCard) {
        const updated = data.creditCard as CreditCard;
        setCards((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
        );
      } else {
        setCards((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
        );
      }
      setMsg("Saved.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  async function deleteCard(id: string) {
    setMsg("");
    try {
      const res = await fetch("/api/budget/credit-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete credit card.");
      setCards((prev) => prev.filter((c) => c.id !== id));
      setMsg("Deleted.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
  }

  useEffect(() => {
    loadCards();
  }, []);

  return (
    <AuthGate>
      <main className="mx-auto mt-10 max-w-5xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Debt</h1>
            <div className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              Credit cards - Total balance:{" "}
              <span className="font-semibold">${totalBalance.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={loadCards}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {msg && (
          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {msg}
          </div>
        )}

        {/* Add card */}
        <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">Add credit card</h2>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Capital One"
                className="min-w-[220px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                APR
              </span>
              <input
                value={apr}
                onChange={(e) => setApr(e.target.value)}
                placeholder="29.99"
                inputMode="decimal"
                className="w-[120px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Current balance
              </span>
              <input
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="1200"
                inputMode="decimal"
                className="w-[140px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Min payment
              </span>
              <input
                value={minPay}
                onChange={(e) => setMinPay(e.target.value)}
                placeholder="35"
                inputMode="decimal"
                className="w-[120px] rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <button
              onClick={addCard}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Add
            </button>
          </div>
        </section>

        {/* List cards */}
        <section className="mt-8">
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                <tr>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-right">APR</th>
                  <th className="p-3 text-right">Balance</th>
                  <th className="p-3 text-right">Min</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                {cards.length === 0 ? (
                  <tr>
                    <td
                      className="p-3 text-zinc-600 dark:text-zinc-300"
                      colSpan={5}
                    >
                      No credit cards yet.
                    </td>
                  </tr>
                ) : (
                  cards.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-zinc-200 dark:border-zinc-800"
                    >
                      <td className="p-3">
                        <input
                          value={c.name}
                          onChange={(e) =>
                            setCards((prev) =>
                              prev.map((x) =>
                                x.id === c.id ? { ...x, name: e.target.value } : x
                              )
                            )
                          }
                          onBlur={() => updateCard(c.id, { name: c.name.trim() })}
                          className="w-full rounded-md border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </td>

                      <td className="p-3 text-right">
                        <input
                          value={c.apr === null ? "" : String(c.apr)}
                          onChange={(e) =>
                            setCards((prev) =>
                              prev.map((x) =>
                                x.id === c.id
                                  ? {
                                      ...x,
                                      apr: e.target.value.trim() === ""
                                        ? null
                                        : Number(e.target.value),
                                    }
                                  : x
                              )
                            )
                          }
                          onBlur={() => updateCard(c.id, { apr: c.apr })}
                          className="w-[110px] rounded-md border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </td>

                      <td className="p-3 text-right">
                        <input
                          value={String(c.current_balance)}
                          onChange={(e) =>
                            setCards((prev) =>
                              prev.map((x) =>
                                x.id === c.id
                                  ? { ...x, current_balance: Number(e.target.value) }
                                  : x
                              )
                            )
                          }
                          onBlur={() =>
                            updateCard(c.id, { current_balance: c.current_balance })
                          }
                          className="w-[140px] rounded-md border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </td>

                      <td className="p-3 text-right">
                        <input
                          value={c.min_payment === null ? "" : String(c.min_payment)}
                          onChange={(e) =>
                            setCards((prev) =>
                              prev.map((x) =>
                                x.id === c.id
                                  ? {
                                      ...x,
                                      min_payment: e.target.value.trim() === ""
                                        ? null
                                        : Number(e.target.value),
                                    }
                                  : x
                              )
                            )
                          }
                          onBlur={() => updateCard(c.id, { min_payment: c.min_payment })}
                          className="w-[110px] rounded-md border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </td>

                      <td className="p-3 text-right">
                        <button
                          onClick={() => deleteCard(c.id)}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            Note: balances auto-update when you add a payment transaction tied to a card.
            Editing/deleting payment transactions is coming later (we'll keep it safe).
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
