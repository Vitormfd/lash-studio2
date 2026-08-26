-- Saídas de caixa (gastos do estúdio). Execute no SQL Editor do Supabase.

create table if not exists public.cash_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null default 'materials',
  amount numeric not null check (amount > 0),
  payment_method text not null default 'cash',
  notes text not null default '',
  expense_date date not null default (timezone('America/Sao_Paulo', now()))::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cash_expenses_user_date_idx
  on public.cash_expenses (user_id, expense_date desc, created_at desc);

comment on table public.cash_expenses is
  'Saídas de dinheiro do caixa do estúdio (ex.: compra de materiais).';
comment on column public.cash_expenses.category is
  'Categoria do gasto: materials | other.';
comment on column public.cash_expenses.payment_method is
  'De onde saiu o dinheiro: cash | pix | credit_card | debit_card.';
comment on column public.cash_expenses.expense_date is
  'Data contábil da saída (timezone America/Sao_Paulo).';

alter table public.cash_expenses enable row level security;

drop policy if exists cash_expenses_own_select on public.cash_expenses;
create policy cash_expenses_own_select
  on public.cash_expenses for select
  using (auth.uid() = user_id);

drop policy if exists cash_expenses_own_insert on public.cash_expenses;
create policy cash_expenses_own_insert
  on public.cash_expenses for insert
  with check (auth.uid() = user_id);

drop policy if exists cash_expenses_own_update on public.cash_expenses;
create policy cash_expenses_own_update
  on public.cash_expenses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists cash_expenses_own_delete on public.cash_expenses;
create policy cash_expenses_own_delete
  on public.cash_expenses for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.cash_expenses to authenticated;

-- Mesma proteção de plano completo usada nas demais tabelas do app
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_full_access_write'
  ) then
    drop trigger if exists trg_cash_expenses_enforce_full_access on public.cash_expenses;
    create trigger trg_cash_expenses_enforce_full_access
      before insert or update or delete on public.cash_expenses
      for each row execute function public.enforce_full_access_write();
  end if;
end;
$$;
