-- GrowMate AI: run this once in your Supabase project's SQL Editor
-- (Project -> SQL Editor -> New query -> paste -> Run).

create extension if not exists pgcrypto;

-- One row per user, holding the whole BusinessSettings object as jsonb.
create table if not exists business_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text not null,
  cost numeric not null default 0,
  sell numeric not null default 0,
  stock numeric not null default 0,
  reorder_level numeric not null default 0,
  expiry_date date,
  supplier text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists products_user_id_idx on products(user_id);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  type text not null,
  quantity numeric not null,
  note text,
  date timestamptz not null default now(),
  related_sale_id uuid
);
create index if not exists stock_movements_user_id_idx on stock_movements(user_id);
create index if not exists stock_movements_product_id_idx on stock_movements(product_id);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  quantity numeric not null,
  unit_price numeric not null,
  unit_cost numeric,
  total numeric not null,
  payment_method text not null,
  customer_name text,
  note text,
  date timestamptz not null default now(),
  is_quick_cash boolean not null default false,
  linked_due_id uuid
);
create index if not exists sales_user_id_idx on sales(user_id);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  category text not null,
  payment_method text not null,
  supplier_name text,
  note text,
  date timestamptz not null default now(),
  linked_due_id uuid
);
create index if not exists expenses_user_id_idx on expenses(user_id);

create table if not exists dues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  name text not null,
  original_amount numeric not null,
  payments jsonb not null default '[]'::jsonb,
  due_date date,
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  auto_created boolean not null default false
);
create index if not exists dues_user_id_idx on dues(user_id);

-- Row Level Security: every table is scoped to its owner.
alter table business_settings enable row level security;
alter table products enable row level security;
alter table stock_movements enable row level security;
alter table sales enable row level security;
alter table expenses enable row level security;
alter table dues enable row level security;

create policy "own rows only" on business_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on stock_movements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on sales
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on dues
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
