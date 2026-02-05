-- Allow "giving" in categories.group_name

alter table if exists public.categories
  drop constraint if exists categories_group_name_check;

alter table if exists public.categories
  add constraint categories_group_name_check
  check (group_name in ('income', 'giving', 'savings', 'expense', 'debt', 'misc'));
