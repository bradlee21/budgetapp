-- planned_items: optional debt account linkage for debt budgets

alter table if exists public.planned_items
  add column if not exists debt_account_id uuid references public.debt_accounts(id) on delete set null;
