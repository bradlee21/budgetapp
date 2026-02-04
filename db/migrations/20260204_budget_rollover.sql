-- Budget rollover + category ordering/archiving

-- Categories: ordering + archive flag
alter table if exists public.categories
  add column if not exists sort_order integer not null default 0;

alter table if exists public.categories
  add column if not exists is_archived boolean not null default false;

-- Backfill sort_order per user/group/parent by name
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, group_name, parent_id
      order by name
    ) as rn
  from public.categories
)
update public.categories c
set sort_order = r.rn
from ranked r
where c.id = r.id;

-- Budget months: available-to-budget rollover pool
create table if not exists public.budget_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  available_start numeric not null default 0,
  available_end numeric not null default 0,
  unique (user_id, month)
);

alter table public.budget_months enable row level security;

drop policy if exists "budget_months_select_own" on public.budget_months;
create policy "budget_months_select_own"
  on public.budget_months
  for select
  using (auth.uid() = user_id);

drop policy if exists "budget_months_insert_own" on public.budget_months;
create policy "budget_months_insert_own"
  on public.budget_months
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "budget_months_update_own" on public.budget_months;
create policy "budget_months_update_own"
  on public.budget_months
  for update
  using (auth.uid() = user_id);

drop policy if exists "budget_months_delete_own" on public.budget_months;
create policy "budget_months_delete_own"
  on public.budget_months
  for delete
  using (auth.uid() = user_id);
