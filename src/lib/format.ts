export function formatMoney(n: number, opts?: { sign?: boolean }) {
  const sign = opts?.sign ? (n < 0 ? "-" : "") : "";
  const value = opts?.sign ? Math.abs(n) : n;
  return `${sign}$${value.toFixed(2)}`;
}
