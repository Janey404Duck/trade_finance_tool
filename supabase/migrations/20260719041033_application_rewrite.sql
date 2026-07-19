-- Application rewrite: discard the quote-package/solution-path model.
-- Profiles and Supabase Auth remain; all trade-finance domain tables are replaced.

drop function if exists public.persist_calculation(jsonb);

drop table if exists public.calculation_component_periods cascade;
drop table if exists public.calculation_issuing_fee_periods cascade;
drop table if exists public.calculation_result_lines cascade;
drop table if exists public.calculation_results cascade;
drop table if exists public.calculation_runs cascade;
drop table if exists public.issuing_bank_fee_rules cascade;
drop table if exists public.migration_review_items cascade;
drop table if exists public.reference_rate_values cascade;
drop table if exists public.reference_rate_indices cascade;
drop table if exists public.reference_rates cascade;
drop table if exists public.quote_charge_rules cascade;
drop table if exists public.quote_components cascade;
drop table if exists public.quote_package_issuing_banks cascade;
drop table if exists public.quote_packages cascade;
drop table if exists public.quote_issuing_banks cascade;
drop table if exists public.quotes cascade;
drop table if exists public.issuing_banks cascade;
drop table if exists public.institutions cascade;

drop type if exists public.solution_path cascade;
drop type if exists public.period_input_mode cascade;
drop type if exists public.lc_issue_timing cascade;
drop type if exists public.timeline_event_type cascade;
drop type if exists public.reference_rate_family cascade;
drop type if exists public.quote_component_type cascade;
drop type if exists public.maturity_basis cascade;
drop type if exists public.min_fee_frequency cascade;
drop type if exists public.anchor_type cascade;
drop type if exists public.rate_type cascade;
drop type if exists public.payer_type cascade;
drop type if exists public.charge_type cascade;
drop type if exists public.financing_type cascade;
drop type if exists public.institution_type cascade;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop function if exists public.current_user_role();

create schema if not exists private;
revoke all on schema private from public;

create function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid());
$$;

revoke all on function private.current_user_role() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_role() to authenticated;

create policy "Users can read own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "Admins can read all profiles"
on public.profiles for select to authenticated
using ((select private.current_user_role()) = 'admin');

create policy "Admins can update profiles"
on public.profiles for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  institution_type text not null
    check (institution_type in ('bank', 'trading_house', 'broker', 'insurance_company', 'other')),
  country text,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trade_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trade_template_events (
  id uuid primary key default gen_random_uuid(),
  trade_template_id uuid not null references public.trade_templates(id) on delete cascade,
  event_name text not null check (event_name in (
    'purchase_order', 'lc_issuance', 'shipment', 'invoice', 'presentation',
    'acceptance', 'supplier_payment', 'negotiation', 'lc_maturity'
  )),
  anchor_event_name text not null check (anchor_event_name in (
    'trade_start', 'purchase_order', 'lc_issuance', 'shipment', 'invoice',
    'presentation', 'acceptance', 'supplier_payment', 'negotiation', 'lc_maturity'
  )),
  offset_days integer not null,
  day_type text not null default 'calendar' check (day_type in ('calendar', 'business')),
  business_day_convention text not null default 'none'
    check (business_day_convention in ('none', 'following', 'preceding')),
  unique (trade_template_id, event_name)
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  institution_id uuid not null references public.institutions(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  product_type text not null default 'lc_financing' check (product_type = 'lc_financing'),
  tenor_days integer check (tenor_days is null or tenor_days > 0),
  min_amount numeric(20, 2) check (min_amount is null or min_amount >= 0),
  max_amount numeric(20, 2) check (max_amount is null or max_amount >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_amount is null or max_amount is null or min_amount <= max_amount)
);

create table public.quotation_versions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'active', 'superseded', 'withdrawn')),
  valid_from date not null,
  valid_to date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quotation_id, version),
  check (valid_to is null or valid_to >= valid_from)
);

create table public.quotation_issuing_institutions (
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  primary key (quotation_id, institution_id)
);

create table public.pricing_records (
  id uuid primary key default gen_random_uuid(),
  quotation_version_id uuid not null references public.quotation_versions(id) on delete cascade,
  label text not null,
  component_kind text not null
    check (component_kind in ('instrument_fee', 'confirmation_fee', 'discounting', 'forfaiting')),
  pricing_condition text not null default 'always'
    check (pricing_condition in ('always', 'confirmation_required', 'confirmation_not_required')),
  rate_type text not null
    check (rate_type in ('fixed_amount', 'flat_percentage', 'annualized_percentage', 'reference_plus_spread')),
  fixed_amount numeric(20, 6),
  rate_pct numeric(12, 8),
  reference_rate_index_id uuid,
  spread_pct numeric(12, 8),
  start_event_name text check (start_event_name in (
    'trade_start', 'purchase_order', 'lc_issuance', 'shipment', 'invoice',
    'presentation', 'acceptance', 'supplier_payment', 'negotiation', 'lc_maturity'
  )),
  end_event_name text check (end_event_name in (
    'trade_start', 'purchase_order', 'lc_issuance', 'shipment', 'invoice',
    'presentation', 'acceptance', 'supplier_payment', 'negotiation', 'lc_maturity'
  )),
  day_count_convention text check (day_count_convention in ('ACT/360', 'ACT/365', '30/360')),
  billing_frequency text not null default 'once'
    check (billing_frequency in ('once', 'monthly', 'quarterly')),
  partial_period_rounding text not null default 'actual'
    check (partial_period_rounding in ('actual', 'up')),
  minimum_period_days integer check (minimum_period_days is null or minimum_period_days >= 0),
  minimum_fee_amount numeric(20, 6) check (minimum_fee_amount is null or minimum_fee_amount >= 0),
  include_start_date boolean not null default false,
  include_end_date boolean not null default true,
  display_order integer not null default 0,
  notes text,
  check ((start_event_name is null) = (end_event_name is null)),
  check (
    (rate_type = 'fixed_amount' and fixed_amount is not null and rate_pct is null and reference_rate_index_id is null and spread_pct is null)
    or (rate_type in ('flat_percentage', 'annualized_percentage') and rate_pct is not null and fixed_amount is null and reference_rate_index_id is null and spread_pct is null)
    or (rate_type = 'reference_plus_spread' and reference_rate_index_id is not null and spread_pct is not null and fixed_amount is null and rate_pct is null)
  )
);

create table public.reference_rate_indices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  family text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tenor_months integer check (tenor_months is null or tenor_months > 0),
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (family, currency, tenor_months)
);

alter table public.pricing_records
  add constraint pricing_records_reference_rate_index_id_fkey
  foreign key (reference_rate_index_id) references public.reference_rate_indices(id) on delete restrict;

create table public.reference_rate_values (
  id uuid primary key default gen_random_uuid(),
  reference_rate_index_id uuid not null references public.reference_rate_indices(id) on delete cascade,
  effective_date date not null,
  rate_pct numeric(12, 8) not null,
  source text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (reference_rate_index_id, effective_date)
);

create table public.trade_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trade_template_id uuid references public.trade_templates(id) on delete set null,
  name text not null,
  amount numeric(20, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  issuing_institution_id uuid references public.institutions(id) on delete restrict,
  trade_start_date date not null,
  confirmation_required boolean not null default false,
  discounting boolean not null default false,
  forfaiting boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (not (discounting and forfaiting))
);

create table public.scenario_events (
  id uuid primary key default gen_random_uuid(),
  trade_scenario_id uuid not null,
  user_id uuid not null,
  event_name text not null check (event_name in (
    'purchase_order', 'lc_issuance', 'shipment', 'invoice', 'presentation',
    'acceptance', 'supplier_payment', 'negotiation', 'lc_maturity'
  )),
  input_mode text not null check (input_mode in ('relative', 'exact')),
  anchor_event_name text check (anchor_event_name in (
    'trade_start', 'purchase_order', 'lc_issuance', 'shipment', 'invoice',
    'presentation', 'acceptance', 'supplier_payment', 'negotiation', 'lc_maturity'
  )),
  offset_days integer,
  exact_date date,
  day_type text check (day_type in ('calendar', 'business')),
  business_day_convention text not null default 'none'
    check (business_day_convention in ('none', 'following', 'preceding')),
  foreign key (trade_scenario_id, user_id)
    references public.trade_scenarios(id, user_id) on delete cascade,
  unique (trade_scenario_id, event_name),
  check (
    (input_mode = 'relative' and anchor_event_name is not null and offset_days is not null and exact_date is null)
    or (input_mode = 'exact' and anchor_event_name is null and offset_days is null and exact_date is not null)
  )
);

create table public.comparison_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trade_scenario_id uuid,
  as_of_date date not null,
  scenario_snapshot jsonb not null,
  resolved_timeline jsonb not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (trade_scenario_id, user_id)
    references public.trade_scenarios(id, user_id) on delete cascade
);

create table public.comparison_results (
  id uuid primary key default gen_random_uuid(),
  comparison_run_id uuid not null,
  user_id uuid not null,
  quotation_id uuid references public.quotations(id) on delete set null,
  quotation_version_id uuid references public.quotation_versions(id) on delete set null,
  quotation_reference text not null,
  institution_name text not null,
  instrument_cost numeric(20, 6) not null,
  confirmation_cost numeric(20, 6) not null,
  financing_cost numeric(20, 6) not null,
  total_cost numeric(20, 6) not null,
  all_in_pct numeric(12, 8) not null,
  result_snapshot jsonb not null,
  foreign key (comparison_run_id, user_id)
    references public.comparison_runs(id, user_id) on delete cascade,
  unique (id, user_id)
);

create table public.comparison_cost_lines (
  id uuid primary key default gen_random_uuid(),
  comparison_result_id uuid not null,
  user_id uuid not null,
  pricing_record_id uuid references public.pricing_records(id) on delete set null,
  label text not null,
  component_kind text not null,
  start_day integer,
  end_day integer,
  charge_days integer,
  effective_rate_pct numeric(12, 8),
  calculated_cost numeric(20, 6) not null,
  final_cost numeric(20, 6) not null,
  line_snapshot jsonb not null,
  foreign key (comparison_result_id, user_id)
    references public.comparison_results(id, user_id) on delete cascade
);

create index institutions_active_name_idx on public.institutions (active, name);
create index institutions_created_by_idx on public.institutions (created_by);
create index institutions_updated_by_idx on public.institutions (updated_by);
create index trade_templates_created_by_idx on public.trade_templates (created_by);
create index trade_templates_updated_by_idx on public.trade_templates (updated_by);
create index trade_template_events_template_idx on public.trade_template_events (trade_template_id);
create index quotations_filter_idx on public.quotations (currency, tenor_days, institution_id);
create index quotations_institution_idx on public.quotations (institution_id);
create index quotations_created_by_idx on public.quotations (created_by);
create index quotations_updated_by_idx on public.quotations (updated_by);
create index quotation_versions_quotation_idx on public.quotation_versions (quotation_id);
create index quotation_versions_created_by_idx on public.quotation_versions (created_by);
create index quotation_versions_active_idx
  on public.quotation_versions (quotation_id, valid_from desc, version desc)
  where status = 'active';
create index quotation_issuing_institutions_institution_idx
  on public.quotation_issuing_institutions (institution_id);
create index pricing_records_version_idx
  on public.pricing_records (quotation_version_id, display_order);
create index pricing_records_reference_rate_idx
  on public.pricing_records (reference_rate_index_id)
  where reference_rate_index_id is not null;
create index reference_rate_values_lookup_idx
  on public.reference_rate_values (reference_rate_index_id, effective_date desc);
create index reference_rate_indices_created_by_idx on public.reference_rate_indices (created_by);
create index reference_rate_indices_updated_by_idx on public.reference_rate_indices (updated_by);
create index reference_rate_values_created_by_idx on public.reference_rate_values (created_by);
create index trade_scenarios_user_idx on public.trade_scenarios (user_id, created_at desc);
create index trade_scenarios_template_idx
  on public.trade_scenarios (trade_template_id)
  where trade_template_id is not null;
create index trade_scenarios_issuer_idx
  on public.trade_scenarios (issuing_institution_id)
  where issuing_institution_id is not null;
create index scenario_events_scenario_user_idx
  on public.scenario_events (trade_scenario_id, user_id);
create index scenario_events_user_idx on public.scenario_events (user_id);
create index comparison_runs_user_idx on public.comparison_runs (user_id, created_at desc);
create index comparison_runs_scenario_idx
  on public.comparison_runs (trade_scenario_id)
  where trade_scenario_id is not null;
create index comparison_runs_scenario_user_idx
  on public.comparison_runs (trade_scenario_id, user_id)
  where trade_scenario_id is not null;
create index comparison_results_user_idx on public.comparison_results (user_id);
create index comparison_results_run_idx on public.comparison_results (comparison_run_id);
create index comparison_results_quotation_idx
  on public.comparison_results (quotation_id)
  where quotation_id is not null;
create index comparison_results_version_idx
  on public.comparison_results (quotation_version_id)
  where quotation_version_id is not null;
create index comparison_cost_lines_user_idx on public.comparison_cost_lines (user_id);
create index comparison_cost_lines_result_idx on public.comparison_cost_lines (comparison_result_id);
create index comparison_cost_lines_pricing_idx
  on public.comparison_cost_lines (pricing_record_id)
  where pricing_record_id is not null;

create trigger institutions_set_updated_at
before update on public.institutions
for each row execute function public.set_updated_at();
create trigger trade_templates_set_updated_at
before update on public.trade_templates
for each row execute function public.set_updated_at();
create trigger quotations_set_updated_at
before update on public.quotations
for each row execute function public.set_updated_at();
create trigger reference_rate_indices_set_updated_at
before update on public.reference_rate_indices
for each row execute function public.set_updated_at();
create trigger trade_scenarios_set_updated_at
before update on public.trade_scenarios
for each row execute function public.set_updated_at();

alter table public.institutions enable row level security;
alter table public.trade_templates enable row level security;
alter table public.trade_template_events enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_versions enable row level security;
alter table public.quotation_issuing_institutions enable row level security;
alter table public.pricing_records enable row level security;
alter table public.reference_rate_indices enable row level security;
alter table public.reference_rate_values enable row level security;
alter table public.trade_scenarios enable row level security;
alter table public.scenario_events enable row level security;
alter table public.comparison_runs enable row level security;
alter table public.comparison_results enable row level security;
alter table public.comparison_cost_lines enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'institutions',
    'trade_templates',
    'trade_template_events',
    'quotations',
    'quotation_versions',
    'quotation_issuing_institutions',
    'pricing_records',
    'reference_rate_indices',
    'reference_rate_values'
  ]
  loop
    execute format(
      'create policy "Authenticated users can read %1$s" on public.%1$I for select to authenticated using (true)',
      table_name
    );
    execute format(
      'create policy "Editors can insert %1$s" on public.%1$I for insert to authenticated with check ((select private.current_user_role()) in (''admin'', ''editor''))',
      table_name
    );
    execute format(
      'create policy "Editors can update %1$s" on public.%1$I for update to authenticated using ((select private.current_user_role()) in (''admin'', ''editor'')) with check ((select private.current_user_role()) in (''admin'', ''editor''))',
      table_name
    );
    execute format(
      'create policy "Admins can delete %1$s" on public.%1$I for delete to authenticated using ((select private.current_user_role()) = ''admin'')',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'trade_scenarios',
    'scenario_events',
    'comparison_runs',
    'comparison_results',
    'comparison_cost_lines'
  ]
  loop
    execute format(
      'create policy "Users can read own %1$s" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))',
      table_name
    );
    execute format(
      'create policy "Users can insert own %1$s" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))',
      table_name
    );
    execute format(
      'create policy "Users can update own %1$s" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      table_name
    );
    execute format(
      'create policy "Users can delete own %1$s" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))',
      table_name
    );
  end loop;
end;
$$;

grant select, insert, update, delete on public.institutions to authenticated;
grant select, insert, update, delete on public.trade_templates to authenticated;
grant select, insert, update, delete on public.trade_template_events to authenticated;
grant select, insert, update, delete on public.quotations to authenticated;
grant select, insert, update, delete on public.quotation_versions to authenticated;
grant select, insert, update, delete on public.quotation_issuing_institutions to authenticated;
grant select, insert, update, delete on public.pricing_records to authenticated;
grant select, insert, update, delete on public.reference_rate_indices to authenticated;
grant select, insert, update, delete on public.reference_rate_values to authenticated;
grant select, insert, update, delete on public.trade_scenarios to authenticated;
grant select, insert, update, delete on public.scenario_events to authenticated;
grant select, insert, update, delete on public.comparison_runs to authenticated;
grant select, insert, update, delete on public.comparison_results to authenticated;
grant select, insert, update, delete on public.comparison_cost_lines to authenticated;
