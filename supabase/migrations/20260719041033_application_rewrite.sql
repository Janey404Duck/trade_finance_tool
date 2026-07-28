-- Quote-only application rewrite. Profiles and Supabase Auth remain.

drop function if exists public.persist_calculation(jsonb);

drop table if exists public.comparison_cost_lines cascade;
drop table if exists public.comparison_results cascade;
drop table if exists public.comparison_runs cascade;
drop table if exists public.scenario_events cascade;
drop table if exists public.scenario_selected_non_issuing_quotations cascade;
drop table if exists public.scenario_selected_non_issuing_institutions cascade;
drop table if exists public.scenario_solutions cascade;
drop table if exists public.scenario_comparison_cases cascade;
drop table if exists public.trade_scenarios cascade;
drop table if exists public.reference_rate_values cascade;
drop table if exists public.reference_rate_indices cascade;
drop table if exists public.reference_rates cascade;
drop table if exists public.issuing_bank_fee_records cascade;
drop table if exists public.issuing_bank_quotation_versions cascade;
drop table if exists public.issuing_bank_quotations cascade;
drop table if exists public.non_issuing_bank_fee_records cascade;
drop table if exists public.non_issuing_quotation_issuing_banks cascade;
drop table if exists public.non_issuing_bank_quotation_versions cascade;
drop table if exists public.non_issuing_bank_quotations cascade;
drop table if exists public.fee_records cascade;
drop table if exists public.pricing_records cascade;
drop table if exists public.institution_fee_schedules cascade;
drop table if exists public.quotation_issuing_institutions cascade;
drop table if exists public.quotation_versions cascade;
drop table if exists public.quotations cascade;
drop table if exists public.trade_template_events cascade;
drop table if exists public.trade_templates cascade;
drop table if exists public.calculation_component_periods cascade;
drop table if exists public.calculation_issuing_fee_periods cascade;
drop table if exists public.calculation_result_lines cascade;
drop table if exists public.calculation_results cascade;
drop table if exists public.calculation_runs cascade;
drop table if exists public.issuing_bank_fee_rules cascade;
drop table if exists public.migration_review_items cascade;
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

create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
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

create table public.issuing_bank_quotations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  institution_id uuid not null references public.institutions(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
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

create table public.issuing_bank_quotation_versions (
  id uuid primary key default gen_random_uuid(),
  issuing_bank_quotation_id uuid not null
    references public.issuing_bank_quotations(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'active', 'superseded', 'withdrawn')),
  valid_from date not null,
  valid_to date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (issuing_bank_quotation_id, version),
  unique (id, issuing_bank_quotation_id),
  check (valid_to is null or valid_to >= valid_from)
);

create table public.issuing_bank_fee_records (
  id uuid primary key default gen_random_uuid(),
  issuing_bank_quotation_version_id uuid not null
    references public.issuing_bank_quotation_versions(id) on delete cascade,
  fee_code text not null check (fee_code ~ '^[a-z0-9][a-z0-9_-]*$'),
  label text not null,
  component_kind text not null check (component_kind in ('issuing_fee', 'swift_fee')),
  disclosure_status text not null check (disclosure_status in ('priced', 'waived')),
  rate_type text check (rate_type in (
    'fixed_amount', 'flat_percentage', 'annualized_percentage', 'reference_plus_spread'
  )),
  fixed_amount numeric(20, 6),
  rate_pct numeric(12, 8),
  reference_rate_family text check (reference_rate_family in ('TERM_SOFR', 'TERM_SHIBOR')),
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
  billing_frequency text not null default 'once' check (billing_frequency in ('once', 'monthly', 'quarterly')),
  partial_period_rounding text not null default 'actual' check (partial_period_rounding in ('actual', 'up')),
  minimum_period_days integer check (minimum_period_days is null or minimum_period_days >= 0),
  minimum_fee_amount numeric(20, 6) check (minimum_fee_amount is null or minimum_fee_amount >= 0),
  include_start_date boolean not null default false,
  include_end_date boolean not null default true,
  display_order integer not null default 0,
  notes text,
  check ((start_event_name is null) = (end_event_name is null)),
  check (
    (disclosure_status = 'priced' and rate_type is not null)
    or (disclosure_status = 'waived' and rate_type is null)
  ),
  check (
    (rate_type is null and fixed_amount is null and rate_pct is null and reference_rate_family is null and spread_pct is null)
    or (rate_type = 'fixed_amount' and fixed_amount is not null and rate_pct is null and reference_rate_family is null and spread_pct is null)
    or (rate_type in ('flat_percentage', 'annualized_percentage') and rate_pct is not null and fixed_amount is null and reference_rate_family is null and spread_pct is null)
    or (rate_type = 'reference_plus_spread' and reference_rate_family is not null and spread_pct is not null and fixed_amount is null and rate_pct is null)
  )
);

create table public.non_issuing_bank_quotations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  institution_id uuid not null references public.institutions(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
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

create table public.non_issuing_bank_quotation_versions (
  id uuid primary key default gen_random_uuid(),
  non_issuing_bank_quotation_id uuid not null
    references public.non_issuing_bank_quotations(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'active', 'superseded', 'withdrawn')),
  valid_from date not null,
  valid_to date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (non_issuing_bank_quotation_id, version),
  unique (id, non_issuing_bank_quotation_id),
  check (valid_to is null or valid_to >= valid_from)
);

create table public.non_issuing_quotation_issuing_banks (
  non_issuing_bank_quotation_id uuid not null
    references public.non_issuing_bank_quotations(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  primary key (non_issuing_bank_quotation_id, institution_id)
);

create table public.non_issuing_bank_fee_records (
  id uuid primary key default gen_random_uuid(),
  non_issuing_bank_quotation_version_id uuid not null
    references public.non_issuing_bank_quotation_versions(id) on delete cascade,
  fee_code text not null check (fee_code ~ '^[a-z0-9][a-z0-9_-]*$'),
  label text not null,
  component_kind text not null check (component_kind in (
    'confirmation_fee', 'deferred_payment_fee', 'discounting', 'forfaiting',
    'advising_fee', 'negotiation_fee', 'swift_fee', 'handling_fee',
    'other_administrative_fee'
  )),
  applicable_solutions text[] not null,
  disclosure_status text not null check (disclosure_status in ('priced', 'waived')),
  rate_type text check (rate_type in (
    'fixed_amount', 'flat_percentage', 'annualized_percentage', 'reference_plus_spread'
  )),
  fixed_amount numeric(20, 6),
  rate_pct numeric(12, 8),
  reference_rate_family text check (reference_rate_family in ('TERM_SOFR', 'TERM_SHIBOR')),
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
  billing_frequency text not null default 'once' check (billing_frequency in ('once', 'monthly', 'quarterly')),
  partial_period_rounding text not null default 'actual' check (partial_period_rounding in ('actual', 'up')),
  minimum_period_days integer check (minimum_period_days is null or minimum_period_days >= 0),
  minimum_fee_amount numeric(20, 6) check (minimum_fee_amount is null or minimum_fee_amount >= 0),
  include_start_date boolean not null default false,
  include_end_date boolean not null default true,
  display_order integer not null default 0,
  notes text,
  check ((start_event_name is null) = (end_event_name is null)),
  check (cardinality(applicable_solutions) > 0),
  check (applicable_solutions <@ array[
    'confirmation_only', 'confirmation_with_discounting', 'discounting_only',
    'forfaiting_only', 'confirmation_with_forfaiting'
  ]::text[]),
  check (
    disclosure_status <> 'priced'
    or component_kind not in ('discounting', 'forfaiting')
    or rate_type = 'reference_plus_spread'
  ),
  check (
    (disclosure_status = 'priced' and rate_type is not null)
    or (disclosure_status = 'waived' and rate_type is null)
  ),
  check (
    (rate_type is null and fixed_amount is null and rate_pct is null and reference_rate_family is null and spread_pct is null)
    or (rate_type = 'fixed_amount' and fixed_amount is not null and rate_pct is null and reference_rate_family is null and spread_pct is null)
    or (rate_type in ('flat_percentage', 'annualized_percentage') and rate_pct is not null and fixed_amount is null and reference_rate_family is null and spread_pct is null)
    or (rate_type = 'reference_plus_spread' and reference_rate_family is not null and spread_pct is not null and fixed_amount is null and rate_pct is null)
  )
);

create table public.reference_rate_indices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  family text not null check (family in ('TERM_SOFR', 'TERM_SHIBOR')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tenor_months integer not null check (tenor_months in (1, 3, 6, 12)),
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (family = 'TERM_SOFR' and currency = 'USD')
    or (family = 'TERM_SHIBOR' and currency = 'CNY')
  ),
  unique nulls not distinct (family, currency, tenor_months)
);

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
  issuing_institution_id uuid not null references public.institutions(id) on delete restrict,
  trade_start_date date not null,
  comparison_mode text not null default 'core_fees_only'
    check (comparison_mode in ('core_fees_only', 'all_available_fees')),
  non_issuing_selection_mode text not null default 'all'
    check (non_issuing_selection_mode in ('all', 'institutions', 'quotations')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.scenario_solutions (
  trade_scenario_id uuid not null,
  user_id uuid not null,
  solution_kind text not null check (solution_kind in (
    'confirmation_only', 'confirmation_with_discounting', 'discounting_only',
    'forfaiting_only', 'confirmation_with_forfaiting'
  )),
  display_order integer not null default 0,
  primary key (trade_scenario_id, solution_kind),
  foreign key (trade_scenario_id, user_id)
    references public.trade_scenarios(id, user_id) on delete cascade
);

create table public.scenario_selected_non_issuing_institutions (
  trade_scenario_id uuid not null,
  user_id uuid not null,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  primary key (trade_scenario_id, institution_id),
  foreign key (trade_scenario_id, user_id)
    references public.trade_scenarios(id, user_id) on delete cascade
);

create table public.scenario_selected_non_issuing_quotations (
  trade_scenario_id uuid not null,
  user_id uuid not null,
  non_issuing_bank_quotation_id uuid not null
    references public.non_issuing_bank_quotations(id) on delete cascade,
  primary key (trade_scenario_id, non_issuing_bank_quotation_id),
  foreign key (trade_scenario_id, user_id)
    references public.trade_scenarios(id, user_id) on delete cascade
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
  issuing_bank_quotation_id uuid references public.issuing_bank_quotations(id) on delete set null,
  issuing_bank_quotation_version_id uuid references public.issuing_bank_quotation_versions(id) on delete set null,
  as_of_date date not null,
  comparison_mode text not null check (comparison_mode in ('core_fees_only', 'all_available_fees')),
  scenario_snapshot jsonb not null,
  resolved_timeline jsonb not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (issuing_bank_quotation_version_id, issuing_bank_quotation_id)
    references public.issuing_bank_quotation_versions(id, issuing_bank_quotation_id)
    on delete set null,
  foreign key (trade_scenario_id, user_id)
    references public.trade_scenarios(id, user_id) on delete cascade,
  check ((issuing_bank_quotation_id is null) = (issuing_bank_quotation_version_id is null))
);

create table public.comparison_results (
  id uuid primary key default gen_random_uuid(),
  comparison_run_id uuid not null,
  user_id uuid not null,
  issuing_bank_quotation_id uuid references public.issuing_bank_quotations(id) on delete set null,
  issuing_bank_quotation_version_id uuid references public.issuing_bank_quotation_versions(id) on delete set null,
  non_issuing_bank_quotation_id uuid references public.non_issuing_bank_quotations(id) on delete set null,
  non_issuing_bank_quotation_version_id uuid references public.non_issuing_bank_quotation_versions(id) on delete set null,
  issuing_quotation_reference text not null,
  issuing_institution_name text not null,
  non_issuing_quotation_reference text not null,
  non_issuing_institution_name text not null,
  solution_kind text not null check (solution_kind in (
    'confirmation_only', 'confirmation_with_discounting', 'discounting_only',
    'forfaiting_only', 'confirmation_with_forfaiting'
  )),
  eligible boolean not null,
  ineligibility_reasons text[] not null default '{}'::text[],
  coverage_status text check (coverage_status in ('complete', 'incomplete')),
  missing_fee_issues jsonb not null default '[]'::jsonb,
  issuing_core_cost numeric(20, 6),
  issuing_administrative_cost numeric(20, 6),
  non_issuing_core_cost numeric(20, 6),
  non_issuing_administrative_cost numeric(20, 6),
  total_cost numeric(20, 6),
  all_in_pct numeric(12, 8),
  result_snapshot jsonb not null,
  foreign key (comparison_run_id, user_id)
    references public.comparison_runs(id, user_id) on delete cascade,
  foreign key (issuing_bank_quotation_version_id, issuing_bank_quotation_id)
    references public.issuing_bank_quotation_versions(id, issuing_bank_quotation_id)
    on delete set null,
  foreign key (non_issuing_bank_quotation_version_id, non_issuing_bank_quotation_id)
    references public.non_issuing_bank_quotation_versions(id, non_issuing_bank_quotation_id)
    on delete set null,
  unique (id, user_id),
  check ((issuing_bank_quotation_id is null) = (issuing_bank_quotation_version_id is null)),
  check ((non_issuing_bank_quotation_id is null) = (non_issuing_bank_quotation_version_id is null)),
  check (
    (eligible and cardinality(ineligibility_reasons) = 0 and coverage_status is not null
      and issuing_core_cost is not null and issuing_administrative_cost is not null
      and non_issuing_core_cost is not null and non_issuing_administrative_cost is not null
      and total_cost is not null and all_in_pct is not null)
    or
    (not eligible and cardinality(ineligibility_reasons) > 0 and coverage_status is null
      and issuing_core_cost is null and issuing_administrative_cost is null
      and non_issuing_core_cost is null and non_issuing_administrative_cost is null
      and total_cost is null and all_in_pct is null)
  )
);

create table public.comparison_cost_lines (
  id uuid primary key default gen_random_uuid(),
  comparison_result_id uuid not null,
  user_id uuid not null,
  quotation_side text not null check (quotation_side in ('issuing_bank', 'non_issuing_bank')),
  issuing_bank_fee_record_id uuid references public.issuing_bank_fee_records(id) on delete set null,
  non_issuing_bank_fee_record_id uuid references public.non_issuing_bank_fee_records(id) on delete set null,
  fee_code text not null,
  label text not null,
  component_kind text not null check (component_kind in (
    'issuing_fee', 'confirmation_fee', 'deferred_payment_fee', 'discounting', 'forfaiting',
    'advising_fee', 'negotiation_fee', 'swift_fee', 'handling_fee',
    'other_administrative_fee'
  )),
  disclosure_status text not null check (disclosure_status in ('priced', 'waived')),
  start_day integer,
  end_day integer,
  charge_days integer,
  reference_rate_index_id uuid references public.reference_rate_indices(id) on delete set null,
  reference_rate_family text,
  reference_rate_tenor_months integer,
  reference_rate_effective_date date,
  base_rate_pct numeric(12, 8),
  effective_rate_pct numeric(12, 8),
  calculated_cost numeric(20, 6) not null,
  final_cost numeric(20, 6) not null,
  line_snapshot jsonb not null,
  foreign key (comparison_result_id, user_id)
    references public.comparison_results(id, user_id) on delete cascade,
  check ((issuing_bank_fee_record_id is null) <> (non_issuing_bank_fee_record_id is null)),
  check (
    (quotation_side = 'issuing_bank' and issuing_bank_fee_record_id is not null)
    or (quotation_side = 'non_issuing_bank' and non_issuing_bank_fee_record_id is not null)
  ),
  check (
    (reference_rate_index_id is null and reference_rate_family is null
      and reference_rate_tenor_months is null and reference_rate_effective_date is null and base_rate_pct is null)
    or
    (reference_rate_index_id is not null and reference_rate_family in ('TERM_SOFR', 'TERM_SHIBOR')
      and reference_rate_tenor_months in (1, 3, 6, 12)
      and reference_rate_effective_date is not null and base_rate_pct is not null)
  )
);

create index institutions_active_name_idx on public.institutions (active, name);
create index institutions_created_by_idx on public.institutions (created_by);
create index institutions_updated_by_idx on public.institutions (updated_by);
create index trade_templates_created_by_idx on public.trade_templates (created_by);
create index trade_templates_updated_by_idx on public.trade_templates (updated_by);
create index trade_template_events_template_idx on public.trade_template_events (trade_template_id);
create index issuing_bank_quotations_filter_idx on public.issuing_bank_quotations (institution_id, currency, tenor_days);
create index issuing_bank_quotations_created_by_idx on public.issuing_bank_quotations (created_by);
create index issuing_bank_quotations_updated_by_idx on public.issuing_bank_quotations (updated_by);
create index issuing_bank_versions_quote_idx on public.issuing_bank_quotation_versions (issuing_bank_quotation_id);
create index issuing_bank_versions_created_by_idx on public.issuing_bank_quotation_versions (created_by);
create index issuing_bank_versions_active_idx on public.issuing_bank_quotation_versions (issuing_bank_quotation_id, valid_from desc, version desc) where status = 'active';
create index issuing_bank_fee_records_version_idx on public.issuing_bank_fee_records (issuing_bank_quotation_version_id, display_order);
create index non_issuing_bank_quotations_filter_idx on public.non_issuing_bank_quotations (currency, tenor_days, institution_id);
create index non_issuing_bank_quotations_institution_idx on public.non_issuing_bank_quotations (institution_id);
create index non_issuing_bank_quotations_created_by_idx on public.non_issuing_bank_quotations (created_by);
create index non_issuing_bank_quotations_updated_by_idx on public.non_issuing_bank_quotations (updated_by);
create index non_issuing_bank_versions_quote_idx on public.non_issuing_bank_quotation_versions (non_issuing_bank_quotation_id);
create index non_issuing_bank_versions_created_by_idx on public.non_issuing_bank_quotation_versions (created_by);
create index non_issuing_bank_versions_active_idx on public.non_issuing_bank_quotation_versions (non_issuing_bank_quotation_id, valid_from desc, version desc) where status = 'active';
create index non_issuing_quote_issuing_banks_institution_idx on public.non_issuing_quotation_issuing_banks (institution_id);
create index non_issuing_bank_fee_records_version_idx on public.non_issuing_bank_fee_records (non_issuing_bank_quotation_version_id, display_order);
create index reference_rate_indices_created_by_idx on public.reference_rate_indices (created_by);
create index reference_rate_indices_updated_by_idx on public.reference_rate_indices (updated_by);
create index reference_rate_values_lookup_idx on public.reference_rate_values (reference_rate_index_id, effective_date desc);
create index reference_rate_values_created_by_idx on public.reference_rate_values (created_by);
create index trade_scenarios_user_idx on public.trade_scenarios (user_id, created_at desc);
create index trade_scenarios_template_idx on public.trade_scenarios (trade_template_id) where trade_template_id is not null;
create index trade_scenarios_issuer_idx on public.trade_scenarios (issuing_institution_id);
create index scenario_solutions_user_idx on public.scenario_solutions (user_id);
create index scenario_solutions_scenario_user_idx on public.scenario_solutions (trade_scenario_id, user_id);
create index scenario_selected_non_issuing_institutions_user_idx on public.scenario_selected_non_issuing_institutions (user_id);
create index scenario_selected_non_issuing_institutions_institution_idx on public.scenario_selected_non_issuing_institutions (institution_id);
create index scenario_selected_non_issuing_institutions_scenario_user_idx on public.scenario_selected_non_issuing_institutions (trade_scenario_id, user_id);
create index scenario_selected_non_issuing_quotations_user_idx on public.scenario_selected_non_issuing_quotations (user_id);
create index scenario_selected_non_issuing_quotations_quote_idx on public.scenario_selected_non_issuing_quotations (non_issuing_bank_quotation_id);
create index scenario_selected_non_issuing_quotations_scenario_user_idx on public.scenario_selected_non_issuing_quotations (trade_scenario_id, user_id);
create index scenario_events_scenario_user_idx on public.scenario_events (trade_scenario_id, user_id);
create index scenario_events_user_idx on public.scenario_events (user_id);
create index comparison_runs_user_idx on public.comparison_runs (user_id, created_at desc);
create index comparison_runs_scenario_user_idx on public.comparison_runs (trade_scenario_id, user_id) where trade_scenario_id is not null;
create index comparison_runs_issuing_quote_idx on public.comparison_runs (issuing_bank_quotation_id) where issuing_bank_quotation_id is not null;
create index comparison_runs_issuing_version_idx on public.comparison_runs (issuing_bank_quotation_version_id) where issuing_bank_quotation_version_id is not null;
create index comparison_runs_issuing_pair_idx on public.comparison_runs (issuing_bank_quotation_version_id, issuing_bank_quotation_id) where issuing_bank_quotation_version_id is not null;
create index comparison_results_user_idx on public.comparison_results (user_id);
create index comparison_results_run_idx on public.comparison_results (comparison_run_id);
create index comparison_results_run_user_idx on public.comparison_results (comparison_run_id, user_id);
create index comparison_results_issuing_quote_idx on public.comparison_results (issuing_bank_quotation_id) where issuing_bank_quotation_id is not null;
create index comparison_results_issuing_version_idx on public.comparison_results (issuing_bank_quotation_version_id) where issuing_bank_quotation_version_id is not null;
create index comparison_results_issuing_pair_idx on public.comparison_results (issuing_bank_quotation_version_id, issuing_bank_quotation_id) where issuing_bank_quotation_version_id is not null;
create index comparison_results_non_issuing_quote_idx on public.comparison_results (non_issuing_bank_quotation_id) where non_issuing_bank_quotation_id is not null;
create index comparison_results_non_issuing_version_idx on public.comparison_results (non_issuing_bank_quotation_version_id) where non_issuing_bank_quotation_version_id is not null;
create index comparison_results_non_issuing_pair_idx on public.comparison_results (non_issuing_bank_quotation_version_id, non_issuing_bank_quotation_id) where non_issuing_bank_quotation_version_id is not null;
create index comparison_cost_lines_user_idx on public.comparison_cost_lines (user_id);
create index comparison_cost_lines_result_idx on public.comparison_cost_lines (comparison_result_id);
create index comparison_cost_lines_result_user_idx on public.comparison_cost_lines (comparison_result_id, user_id);
create index comparison_cost_lines_issuing_fee_idx on public.comparison_cost_lines (issuing_bank_fee_record_id) where issuing_bank_fee_record_id is not null;
create index comparison_cost_lines_non_issuing_fee_idx on public.comparison_cost_lines (non_issuing_bank_fee_record_id) where non_issuing_bank_fee_record_id is not null;
create index comparison_cost_lines_reference_rate_idx on public.comparison_cost_lines (reference_rate_index_id) where reference_rate_index_id is not null;

create trigger institutions_set_updated_at before update on public.institutions
for each row execute function public.set_updated_at();
create trigger trade_templates_set_updated_at before update on public.trade_templates
for each row execute function public.set_updated_at();
create trigger issuing_bank_quotations_set_updated_at before update on public.issuing_bank_quotations
for each row execute function public.set_updated_at();
create trigger non_issuing_bank_quotations_set_updated_at before update on public.non_issuing_bank_quotations
for each row execute function public.set_updated_at();
create trigger reference_rate_indices_set_updated_at before update on public.reference_rate_indices
for each row execute function public.set_updated_at();
create trigger trade_scenarios_set_updated_at before update on public.trade_scenarios
for each row execute function public.set_updated_at();

alter table public.institutions enable row level security;
alter table public.trade_templates enable row level security;
alter table public.trade_template_events enable row level security;
alter table public.issuing_bank_quotations enable row level security;
alter table public.issuing_bank_quotation_versions enable row level security;
alter table public.issuing_bank_fee_records enable row level security;
alter table public.non_issuing_bank_quotations enable row level security;
alter table public.non_issuing_bank_quotation_versions enable row level security;
alter table public.non_issuing_quotation_issuing_banks enable row level security;
alter table public.non_issuing_bank_fee_records enable row level security;
alter table public.reference_rate_indices enable row level security;
alter table public.reference_rate_values enable row level security;
alter table public.trade_scenarios enable row level security;
alter table public.scenario_solutions enable row level security;
alter table public.scenario_selected_non_issuing_institutions enable row level security;
alter table public.scenario_selected_non_issuing_quotations enable row level security;
alter table public.scenario_events enable row level security;
alter table public.comparison_runs enable row level security;
alter table public.comparison_results enable row level security;
alter table public.comparison_cost_lines enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'institutions', 'trade_templates', 'trade_template_events',
    'issuing_bank_quotations', 'issuing_bank_quotation_versions', 'issuing_bank_fee_records',
    'non_issuing_bank_quotations', 'non_issuing_bank_quotation_versions',
    'non_issuing_quotation_issuing_banks', 'non_issuing_bank_fee_records',
    'reference_rate_indices', 'reference_rate_values'
  ] loop
    execute format('create policy "Authenticated users can read %1$s" on public.%1$I for select to authenticated using (true)', table_name);
    execute format('create policy "Editors can insert %1$s" on public.%1$I for insert to authenticated with check ((select private.current_user_role()) in (''admin'', ''editor''))', table_name);
    execute format('create policy "Editors can update %1$s" on public.%1$I for update to authenticated using ((select private.current_user_role()) in (''admin'', ''editor'')) with check ((select private.current_user_role()) in (''admin'', ''editor''))', table_name);
    execute format('create policy "Admins can delete %1$s" on public.%1$I for delete to authenticated using ((select private.current_user_role()) = ''admin'')', table_name);
  end loop;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'trade_scenarios', 'scenario_solutions',
    'scenario_selected_non_issuing_institutions',
    'scenario_selected_non_issuing_quotations', 'scenario_events',
    'comparison_runs', 'comparison_results', 'comparison_cost_lines'
  ] loop
    execute format('create policy "Users can read own %1$s" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', table_name);
    execute format('create policy "Users can insert own %1$s" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', table_name);
    execute format('create policy "Users can update own %1$s" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', table_name);
    execute format('create policy "Users can delete own %1$s" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', table_name);
  end loop;
end;
$$;

grant select, insert, update, delete on public.institutions to authenticated;
grant select, insert, update, delete on public.trade_templates to authenticated;
grant select, insert, update, delete on public.trade_template_events to authenticated;
grant select, insert, update, delete on public.issuing_bank_quotations to authenticated;
grant select, insert, update, delete on public.issuing_bank_quotation_versions to authenticated;
grant select, insert, update, delete on public.issuing_bank_fee_records to authenticated;
grant select, insert, update, delete on public.non_issuing_bank_quotations to authenticated;
grant select, insert, update, delete on public.non_issuing_bank_quotation_versions to authenticated;
grant select, insert, update, delete on public.non_issuing_quotation_issuing_banks to authenticated;
grant select, insert, update, delete on public.non_issuing_bank_fee_records to authenticated;
grant select, insert, update, delete on public.reference_rate_indices to authenticated;
grant select, insert, update, delete on public.reference_rate_values to authenticated;
grant select, insert, update, delete on public.trade_scenarios to authenticated;
grant select, insert, update, delete on public.scenario_solutions to authenticated;
grant select, insert, update, delete on public.scenario_selected_non_issuing_institutions to authenticated;
grant select, insert, update, delete on public.scenario_selected_non_issuing_quotations to authenticated;
grant select, insert, update, delete on public.scenario_events to authenticated;
grant select, insert, update, delete on public.comparison_runs to authenticated;
grant select, insert, update, delete on public.comparison_results to authenticated;
grant select, insert, update, delete on public.comparison_cost_lines to authenticated;
