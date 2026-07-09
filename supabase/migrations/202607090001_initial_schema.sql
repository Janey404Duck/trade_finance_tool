create extension if not exists "pgcrypto";

create type public.institution_type as enum (
  'bank',
  'trading_house',
  'broker',
  'insurance_company',
  'other'
);

create type public.financing_type as enum (
  'confirmation',
  'discounting',
  'forfaiting',
  'mixed',
  'issuing_fee',
  'trading_house'
);

create type public.charge_type as enum (
  'confirmation',
  'deferred',
  'discounting',
  'forfaiting',
  'issuing_fee',
  'handling',
  'amendment',
  'other'
);

create type public.payer_type as enum (
  'applicant',
  'beneficiary',
  'shared',
  'unknown'
);

create type public.rate_type as enum (
  'flat_pct',
  'annual_pct',
  'base_plus_spread',
  'fixed_amount'
);

create type public.anchor_type as enum (
  'LC_ISSUE_DAY',
  'SHIPMENT_DAY',
  'SUPPLIER_PAYMENT_DAY',
  'FINAL_MATURITY_DAY'
);

create type public.min_fee_frequency as enum (
  'none',
  'transaction',
  'month'
);

create type public.user_role as enum (
  'admin',
  'editor',
  'viewer'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role public.user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution_type public.institution_type not null,
  country text,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institutions_name_unique unique (name)
);

create table public.issuing_banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'Turkey',
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issuing_banks_name_unique unique (name)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete restrict,
  quote_name text not null,
  currency text not null,
  financing_type public.financing_type not null,
  requires_confirmation boolean not null default false,
  applies_to_all_issuing_banks boolean not null default true,
  min_amount numeric(18, 2),
  max_amount numeric(18, 2),
  min_maturity_days integer,
  max_maturity_days integer,
  valid_from date,
  valid_to date,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_amount_range_check check (min_amount is null or max_amount is null or min_amount <= max_amount),
  constraint quotes_maturity_range_check check (min_maturity_days is null or max_maturity_days is null or min_maturity_days <= max_maturity_days),
  constraint quotes_financing_confirmation_check check (
    (financing_type <> 'discounting' or requires_confirmation is true)
    and (financing_type <> 'forfaiting' or requires_confirmation is false)
  )
);

create table public.quote_issuing_banks (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  issuing_bank_id uuid not null references public.issuing_banks(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint quote_issuing_banks_unique unique (quote_id, issuing_bank_id)
);

create table public.quote_charge_rules (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  charge_type public.charge_type not null,
  payer public.payer_type not null default 'applicant',
  rate_type public.rate_type not null,
  fixed_rate_pct numeric(10, 6),
  base_rate_key text,
  spread_pct numeric(10, 6),
  fixed_amount numeric(18, 2),
  amount_basis text not null default 'transaction_amount',
  day_count_basis integer not null default 360,
  start_anchor public.anchor_type,
  start_offset_days integer not null default 0,
  end_anchor public.anchor_type,
  end_offset_days integer not null default 0,
  min_fee_amount numeric(18, 2),
  min_fee_frequency public.min_fee_frequency not null default 'none',
  display_order integer not null default 0,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_charge_day_count_basis_check check (day_count_basis in (360, 365)),
  constraint quote_charge_amount_basis_check check (amount_basis in ('transaction_amount')),
  constraint quote_charge_min_fee_check check (
    (min_fee_frequency = 'none' and min_fee_amount is null)
    or (min_fee_frequency <> 'none' and min_fee_amount is not null)
  ),
  constraint quote_charge_rule_rate_check check (
    (rate_type = 'flat_pct' and fixed_rate_pct is not null)
    or (rate_type = 'annual_pct' and fixed_rate_pct is not null and start_anchor is not null and end_anchor is not null)
    or (rate_type = 'base_plus_spread' and base_rate_key is not null and spread_pct is not null and start_anchor is not null and end_anchor is not null)
    or (rate_type = 'fixed_amount' and fixed_amount is not null)
  )
);

create table public.reference_rates (
  id uuid primary key default gen_random_uuid(),
  rate_key text not null,
  currency text not null,
  tenor_days integer,
  rate_pct numeric(10, 6) not null,
  rate_date date not null,
  source text,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reference_rates_unique unique (rate_key, currency, tenor_days, rate_date)
);

create table public.issuing_bank_fee_rules (
  id uuid primary key default gen_random_uuid(),
  issuing_bank_id uuid not null references public.issuing_banks(id) on delete cascade,
  currency text not null,
  fee_name text not null,
  charge_type public.charge_type not null default 'issuing_fee',
  rate_type public.rate_type not null,
  fixed_rate_pct numeric(10, 6),
  base_rate_key text,
  spread_pct numeric(10, 6),
  fixed_amount numeric(18, 2),
  amount_basis text not null default 'transaction_amount',
  day_count_basis integer not null default 360,
  start_anchor public.anchor_type,
  start_offset_days integer not null default 0,
  end_anchor public.anchor_type,
  end_offset_days integer not null default 0,
  min_fee_amount numeric(18, 2),
  min_fee_frequency public.min_fee_frequency not null default 'none',
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issuing_fee_day_count_basis_check check (day_count_basis in (360, 365)),
  constraint issuing_fee_amount_basis_check check (amount_basis in ('transaction_amount')),
  constraint issuing_fee_min_fee_check check (
    (min_fee_frequency = 'none' and min_fee_amount is null)
    or (min_fee_frequency <> 'none' and min_fee_amount is not null)
  ),
  constraint issuing_fee_rate_check check (
    (rate_type = 'flat_pct' and fixed_rate_pct is not null)
    or (rate_type = 'annual_pct' and fixed_rate_pct is not null and start_anchor is not null and end_anchor is not null)
    or (rate_type = 'base_plus_spread' and base_rate_key is not null and spread_pct is not null and start_anchor is not null and end_anchor is not null)
    or (rate_type = 'fixed_amount' and fixed_amount is not null)
  )
);

create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  issuing_bank_id uuid not null references public.issuing_banks(id),
  currency text not null,
  transaction_amount numeric(18, 2) not null,
  lc_maturity_days integer not null,
  shipment_days integer not null,
  payment_terms_days integer not null,
  assumptions_json jsonb not null,
  created_at timestamptz not null default now()
);

create table public.calculation_results (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.calculation_runs(id) on delete cascade,
  quote_id uuid not null references public.quotes(id),
  institution_id uuid not null references public.institutions(id),
  eligible boolean not null default true,
  ineligibility_reason text,
  external_quote_cost numeric(18, 6) not null default 0,
  issuing_bank_cost numeric(18, 6) not null default 0,
  total_cost numeric(18, 6) not null default 0,
  all_in_pct numeric(12, 6) not null default 0,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

create table public.calculation_result_lines (
  id uuid primary key default gen_random_uuid(),
  calculation_result_id uuid not null references public.calculation_results(id) on delete cascade,
  source_type text not null,
  source_rule_id uuid,
  charge_type public.charge_type not null,
  payer public.payer_type not null,
  start_anchor public.anchor_type,
  end_anchor public.anchor_type,
  start_day integer,
  end_day integer,
  charge_days integer,
  amount numeric(18, 2) not null,
  rate_type public.rate_type not null,
  fixed_rate_pct numeric(10, 6),
  base_rate_key text,
  base_rate_pct numeric(10, 6),
  spread_pct numeric(10, 6),
  effective_rate_pct numeric(10, 6),
  fixed_amount numeric(18, 2),
  day_count_basis integer,
  calculated_fee numeric(18, 6) not null,
  final_fee numeric(18, 6) not null,
  formula_text text not null,
  excel_formula_template text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint calculation_result_lines_source_type_check check (source_type in ('quote_charge_rule', 'issuing_bank_fee_rule'))
);

create index quotes_lookup_idx on public.quotes (active, currency, valid_from, valid_to);
create index quote_charge_rules_quote_idx on public.quote_charge_rules (quote_id, active, display_order);
create index quote_issuing_banks_quote_idx on public.quote_issuing_banks (quote_id, issuing_bank_id);
create index reference_rates_lookup_idx on public.reference_rates (rate_key, currency, active, rate_date desc);
create index issuing_bank_fee_rules_lookup_idx on public.issuing_bank_fee_rules (issuing_bank_id, currency, active);
create index calculation_runs_user_idx on public.calculation_runs (user_id, created_at desc);
create index calculation_results_run_idx on public.calculation_results (calculation_run_id);
create index calculation_result_lines_result_idx on public.calculation_result_lines (calculation_result_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger institutions_set_updated_at before update on public.institutions for each row execute function public.set_updated_at();
create trigger issuing_banks_set_updated_at before update on public.issuing_banks for each row execute function public.set_updated_at();
create trigger quotes_set_updated_at before update on public.quotes for each row execute function public.set_updated_at();
create trigger quote_charge_rules_set_updated_at before update on public.quote_charge_rules for each row execute function public.set_updated_at();
create trigger reference_rates_set_updated_at before update on public.reference_rates for each row execute function public.set_updated_at();
create trigger issuing_bank_fee_rules_set_updated_at before update on public.issuing_bank_fee_rules for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.institutions enable row level security;
alter table public.issuing_banks enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_issuing_banks enable row level security;
alter table public.quote_charge_rules enable row level security;
alter table public.reference_rates enable row level security;
alter table public.issuing_bank_fee_rules enable row level security;
alter table public.calculation_runs enable row level security;
alter table public.calculation_results enable row level security;
alter table public.calculation_result_lines enable row level security;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (public.current_user_role() = 'admin');

create policy "Admins can update profiles"
on public.profiles
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "Authenticated users can read institutions" on public.institutions for select to authenticated using (true);
create policy "Authenticated users can read issuing banks" on public.issuing_banks for select to authenticated using (true);
create policy "Authenticated users can read quotes" on public.quotes for select to authenticated using (true);
create policy "Authenticated users can read quote issuing banks" on public.quote_issuing_banks for select to authenticated using (true);
create policy "Authenticated users can read quote charge rules" on public.quote_charge_rules for select to authenticated using (true);
create policy "Authenticated users can read reference rates" on public.reference_rates for select to authenticated using (true);
create policy "Authenticated users can read issuing bank fee rules" on public.issuing_bank_fee_rules for select to authenticated using (true);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'institutions',
    'issuing_banks',
    'quotes',
    'quote_issuing_banks',
    'quote_charge_rules',
    'reference_rates',
    'issuing_bank_fee_rules'
  ]
  loop
    execute format(
      'create policy "Admins and editors can insert %1$s" on public.%1$I for insert to authenticated with check (public.current_user_role() in (''admin'', ''editor''))',
      table_name
    );
    execute format(
      'create policy "Admins and editors can update %1$s" on public.%1$I for update to authenticated using (public.current_user_role() in (''admin'', ''editor'')) with check (public.current_user_role() in (''admin'', ''editor''))',
      table_name
    );
    execute format(
      'create policy "Admins can delete %1$s" on public.%1$I for delete to authenticated using (public.current_user_role() = ''admin'')',
      table_name
    );
  end loop;
end;
$$;

create policy "Users can insert own calculation runs"
on public.calculation_runs
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can read own calculation runs"
on public.calculation_runs
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Admins can read all calculation runs"
on public.calculation_runs
for select
to authenticated
using (public.current_user_role() = 'admin');

create policy "Users can insert own calculation results"
on public.calculation_results
for insert
to authenticated
with check (
  exists (
    select 1
    from public.calculation_runs cr
    where cr.id = calculation_results.calculation_run_id
    and cr.user_id = (select auth.uid())
  )
);

create policy "Users can read own calculation results"
on public.calculation_results
for select
to authenticated
using (
  exists (
    select 1
    from public.calculation_runs cr
    where cr.id = calculation_results.calculation_run_id
    and cr.user_id = (select auth.uid())
  )
);

create policy "Admins can read all calculation results"
on public.calculation_results
for select
to authenticated
using (public.current_user_role() = 'admin');

create policy "Users can insert own calculation result lines"
on public.calculation_result_lines
for insert
to authenticated
with check (
  exists (
    select 1
    from public.calculation_results result
    join public.calculation_runs run on run.id = result.calculation_run_id
    where result.id = calculation_result_lines.calculation_result_id
    and run.user_id = (select auth.uid())
  )
);

create policy "Users can read own calculation result lines"
on public.calculation_result_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.calculation_results result
    join public.calculation_runs run on run.id = result.calculation_run_id
    where result.id = calculation_result_lines.calculation_result_id
    and run.user_id = (select auth.uid())
  )
);

create policy "Admins can read all calculation result lines"
on public.calculation_result_lines
for select
to authenticated
using (public.current_user_role() = 'admin');
