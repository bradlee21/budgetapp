-- Debt accounts (non-credit-card) and transaction linkage

create table if not exists public.debt_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  balance numeric not null default 0,
  apr numeric,
  min_payment numeric,
  due_date date,
  created_at timestamptz not null default now()
);

alter table public.debt_accounts enable row level security;

drop policy if exists "debt_accounts_select_own" on public.debt_accounts;
create policy "debt_accounts_select_own"
  on public.debt_accounts
  for select
  using (auth.uid() = user_id);

drop policy if exists "debt_accounts_insert_own" on public.debt_accounts;
create policy "debt_accounts_insert_own"
  on public.debt_accounts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "debt_accounts_update_own" on public.debt_accounts;
create policy "debt_accounts_update_own"
  on public.debt_accounts
  for update
  using (auth.uid() = user_id);

drop policy if exists "debt_accounts_delete_own" on public.debt_accounts;
create policy "debt_accounts_delete_own"
  on public.debt_accounts
  for delete
  using (auth.uid() = user_id);

alter table if exists public.transactions
  add column if not exists debt_account_id uuid references public.debt_accounts(id) on delete set null;
