export function firstDayOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function nextMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function addMonths(d: Date, m: number) {
  return new Date(d.getFullYear(), d.getMonth() + m, 1);
}

export function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function toMonthKey(d: Date) {
  return toYMD(firstDayOfMonth(d));
}
