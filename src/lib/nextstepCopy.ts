export type NextStepTone = "facts" | "guided" | "coach";

export type NextStepTrigger =
  | "DEBT_MIN_MISSING"
  | "LEFT_TO_BUDGET_NEGATIVE"
  | "UNCATEGORIZED_TXNS"
  | "CATEGORY_OVERSPENT"
  | "LEFT_TO_BUDGET_POSITIVE"
  | null;

export type NextStepContext = {
  leftToBudget: number;
  uncategorizedCount: number;
  overspentLabel?: string;
  overspentAmount?: number;
  debtMinMissingCount: number;
};

function addEncouragement(
  body: string,
  tone: NextStepTone,
  encouragement: boolean
) {
  if (!encouragement) return body;
  const extra =
    tone === "facts"
      ? "Small steps compound."
      : tone === "guided"
      ? "Small steps compound."
      : "You've got this—one small step at a time.";
  return `${body} ${extra}`;
}

export function getNextStepMessage(
  trigger: NextStepTrigger,
  tone: NextStepTone,
  context: NextStepContext,
  encouragement = true
): { title: string; body: string } | null {
  if (!trigger) return null;

  switch (trigger) {
    case "DEBT_MIN_MISSING": {
      const count = context.debtMinMissingCount;
      const core =
        tone === "facts"
          ? `Minimum payment is missing for ${count} debt account${
              count === 1 ? "" : "s"
            }.`
          : tone === "guided"
          ? `Add minimum payments for ${count} debt account${
              count === 1 ? "" : "s"
            } to keep your plan accurate.`
          : `Set minimum payments for ${count} debt account${
              count === 1 ? "" : "s"
            } so your plan protects you first.`;
      const body =
        tone === "facts"
          ? `${core} Add a minimum payment to keep the plan accurate.`
          : core;
      return { title: "NextStep", body: addEncouragement(body, tone, encouragement) };
    }
    case "LEFT_TO_BUDGET_NEGATIVE": {
      const amt = Math.abs(context.leftToBudget);
      const core =
        tone === "facts"
          ? `Left to budget is negative by ${formatMoney(amt)}.`
          : tone === "guided"
          ? `You're over budget by ${formatMoney(amt)}.`
          : `Bring left to budget back to zero by ${formatMoney(amt)}.`;
      const body =
        tone === "facts"
          ? `${core} Reduce planned outflows or add income.`
          : `${core} Adjust planned spending or income to rebalance.`;
      return { title: "NextStep", body: addEncouragement(body, tone, encouragement) };
    }
    case "UNCATEGORIZED_TXNS": {
      const count = context.uncategorizedCount;
      const core =
        tone === "facts"
          ? `${count} transaction${count === 1 ? "" : "s"} are uncategorized.`
          : tone === "guided"
          ? `You have ${count} uncategorized transaction${
              count === 1 ? "" : "s"
            }.`
          : `Let’s categorize ${count} transaction${
              count === 1 ? "" : "s"
            } to keep totals accurate.`;
      const body =
        tone === "facts"
          ? `${core} Categorize them to update totals.`
          : `${core} Categorize them so your totals reflect reality.`;
      return { title: "NextStep", body: addEncouragement(body, tone, encouragement) };
    }
    case "CATEGORY_OVERSPENT": {
      const label = context.overspentLabel ?? "a category";
      const amt = Math.abs(context.overspentAmount ?? 0);
      const core =
        tone === "facts"
          ? `Most overspent: ${label} by ${formatMoney(amt)}.`
          : tone === "guided"
          ? `Largest overspend is ${label} (${formatMoney(amt)}).`
          : `Let’s bring ${label} back on track (${formatMoney(amt)}).`;
      const body =
        tone === "facts"
          ? `${core} Review planned vs actual.`
          : `${core} Adjust planned or shift funds.`;
      return { title: "NextStep", body: addEncouragement(body, tone, encouragement) };
    }
    case "LEFT_TO_BUDGET_POSITIVE": {
      const amt = context.leftToBudget;
      const core =
        tone === "facts"
          ? `Left to budget is ${formatMoney(amt)}.`
          : tone === "guided"
          ? `You have ${formatMoney(amt)} left to budget.`
          : `Great—${formatMoney(amt)} is ready to assign.`;
      const body =
        tone === "facts"
          ? `${core} Assign it to a category.`
          : `${core} Allocate it to a priority.`;
      return { title: "NextStep", body: addEncouragement(body, tone, encouragement) };
    }
    default:
      return null;
  }
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}
