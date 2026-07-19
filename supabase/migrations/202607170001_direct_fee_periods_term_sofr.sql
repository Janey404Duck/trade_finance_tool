do $$ begin
  create type public.timeline_event_type as enum (
    'TRADE_START_DAY', 'DEPOSIT_DAY', 'SHIPMENT_DAY', 'LC_ISSUE_DAY',
    'SUPPLIER_PAYMENT_DAY', 'FINAL_MATURITY_DAY'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lc_issue_timing as enum ('BEFORE_SHIPMENT', 'ON_SHIPMENT', 'AFTER_SHIPMENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.period_input_mode as enum ('PRESET', 'MANUAL', 'DRAGGED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.solution_path as enum ('CONFIRMATION', 'FORFAITING');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reference_rate_family as enum ('TERM_SOFR', 'TERM_SHIBOR', 'COF', 'OTHER');
exception when duplicate_object then null; end $$;

create table public.reference_rate_indices (
  id uuid primary key default gen_random_uuid(),
  rate_family public.reference_rate_family not null,
  display_name text not null,
  currency text not null,
  tenor_months integer,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reference_rate_tenor_check check (tenor_months is null or tenor_months in (1, 3, 6, 12)),
  constraint reference_rate_index_unique unique nulls not distinct (rate_family, currency, tenor_months)
);

create table public.reference_rate_values (
  id uuid primary key default gen_random_uuid(),
  reference_rate_index_id uuid not null references public.reference_rate_indices(id) on delete cascade,
  effective_date date not null,
  rate_pct numeric(10, 6) not null,
  source text,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reference_rate_value_unique unique (reference_rate_index_id, effective_date)
);

create table public.migration_review_items (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null,
  object_type text not null,
  object_id uuid,
  reason text not null,
  legacy_values jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution_notes text,
  created_at timestamptz not null default now(),
  constraint migration_review_item_unique unique (migration_key, object_type, object_id, reason)
);

insert into public.reference_rate_indices (rate_family, display_name, currency, tenor_months, notes)
values
  ('TERM_SOFR', '1M Term SOFR', 'USD', 1, 'Exact tenor required; no value migrated from generic TERM_SOFR.'),
  ('TERM_SOFR', '3M Term SOFR', 'USD', 3, 'Exact tenor required; no value migrated from generic TERM_SOFR.'),
  ('TERM_SOFR', '6M Term SOFR', 'USD', 6, 'Exact tenor required; no value migrated from generic TERM_SOFR.'),
  ('TERM_SOFR', '12M Term SOFR', 'USD', 12, 'Exact tenor required; no value migrated from generic TERM_SOFR.')
on conflict (rate_family, currency, tenor_months) do nothing;

insert into public.reference_rate_indices (rate_family, display_name, currency, tenor_months, notes)
select distinct
  case upper(rate_key)
    when 'TERM_SHIBOR' then 'TERM_SHIBOR'::public.reference_rate_family
    when 'COF' then 'COF'::public.reference_rate_family
    else 'OTHER'::public.reference_rate_family
  end,
  case
    when upper(rate_key) = 'TERM_SHIBOR' and tenor_days in (30, 90, 180, 360)
      then (case tenor_days when 30 then 1 when 90 then 3 when 180 then 6 else 12 end)::text || 'M Term SHIBOR'
    else upper(rate_key)
  end,
  upper(currency),
  case
    when upper(rate_key) = 'TERM_SHIBOR' then case tenor_days when 30 then 1 when 90 then 3 when 180 then 6 when 360 then 12 end
    else null
  end,
  'Migrated from legacy reference_rates.'
from public.reference_rates
where upper(rate_key) <> 'TERM_SOFR'
  and (upper(rate_key) <> 'TERM_SHIBOR' or tenor_days in (30, 90, 180, 360))
on conflict (rate_family, currency, tenor_months) do nothing;

insert into public.reference_rate_values (
  reference_rate_index_id, effective_date, rate_pct, source, active, notes, created_by, updated_by
)
select
  index.id, legacy.rate_date, legacy.rate_pct, legacy.source, legacy.active,
  coalesce(legacy.notes, 'Migrated from legacy reference_rates.'), legacy.created_by, legacy.updated_by
from public.reference_rates legacy
join public.reference_rate_indices index
  on index.currency = upper(legacy.currency)
  and index.rate_family = case upper(legacy.rate_key)
    when 'TERM_SHIBOR' then 'TERM_SHIBOR'::public.reference_rate_family
    when 'COF' then 'COF'::public.reference_rate_family
    else 'OTHER'::public.reference_rate_family
  end
  and index.tenor_months is not distinct from case
    when upper(legacy.rate_key) = 'TERM_SHIBOR' then case legacy.tenor_days when 30 then 1 when 90 then 3 when 180 then 6 when 360 then 12 end
    else null
  end
where upper(legacy.rate_key) <> 'TERM_SOFR'
  and (upper(legacy.rate_key) <> 'TERM_SHIBOR' or legacy.tenor_days in (30, 90, 180, 360))
on conflict (reference_rate_index_id, effective_date) do nothing;

insert into public.migration_review_items (migration_key, object_type, object_id, reason, legacy_values)
select
  'direct_fee_periods_term_sofr', 'reference_rate', id,
  'Generic TERM_SOFR value requires manual tenor assignment.',
  jsonb_build_object('rate_key', rate_key, 'currency', currency, 'tenor_days', tenor_days, 'rate_pct', rate_pct, 'rate_date', rate_date)
from public.reference_rates
where upper(rate_key) = 'TERM_SOFR'
on conflict do nothing;

alter table public.quote_components
  add column charge_type public.charge_type,
  add column payer public.payer_type not null default 'applicant',
  add column rate_type public.rate_type,
  add column fixed_rate_pct numeric(10, 6),
  add column reference_rate_index_id uuid references public.reference_rate_indices(id),
  add column spread_pct numeric(10, 6),
  add column fixed_amount numeric(18, 2),
  add column day_count_basis integer not null default 360,
  add column min_fee_amount numeric(18, 2),
  add column min_fee_frequency public.min_fee_frequency not null default 'none',
  add column suggested_start_event public.timeline_event_type,
  add column suggested_end_event public.timeline_event_type,
  add column display_order integer not null default 0;

alter table public.quote_components
  add constraint quote_component_day_count_check check (day_count_basis in (360, 365)),
  add constraint quote_component_min_fee_check check (
    (min_fee_frequency = 'none' and min_fee_amount is null)
    or (min_fee_frequency <> 'none' and min_fee_amount is not null)
  ),
  add constraint quote_component_pricing_check check (
    active is false
    or (rate_type = 'flat_pct' and fixed_rate_pct is not null)
    or (rate_type = 'annual_pct' and fixed_rate_pct is not null)
    or (rate_type = 'base_plus_spread' and reference_rate_index_id is not null and spread_pct is not null)
    or (rate_type = 'fixed_amount' and fixed_amount is not null)
  ) not valid;

insert into public.migration_review_items (migration_key, object_type, object_id, reason, legacy_values)
select
  'direct_fee_periods_term_sofr', 'quote_component', component.id,
  'Component has multiple active charge rules and cannot be consolidated automatically.',
  jsonb_build_object('active_rule_count', count(rule.id), 'rule_ids', jsonb_agg(rule.id order by rule.id))
from public.quote_components component
join public.quote_charge_rules rule on rule.quote_component_id = component.id and rule.active
group by component.id
having count(rule.id) <> 1
on conflict do nothing;

insert into public.migration_review_items (migration_key, object_type, object_id, reason, legacy_values)
select
  'direct_fee_periods_term_sofr', 'quote_component', component.id,
  'Non-zero fee-period offset requires manual review.',
  jsonb_build_object(
    'rule_id', rule.id, 'start_anchor', rule.start_anchor, 'start_offset_days', rule.start_offset_days,
    'end_anchor', rule.end_anchor, 'end_offset_days', rule.end_offset_days
  )
from public.quote_components component
join public.quote_charge_rules rule on rule.quote_component_id = component.id and rule.active
where rule.start_offset_days <> 0 or rule.end_offset_days <> 0
on conflict do nothing;

insert into public.migration_review_items (migration_key, object_type, object_id, reason, legacy_values)
select
  'direct_fee_periods_term_sofr', 'quote_component', component.id,
  'Generic TERM_SOFR pricing requires manual tenor assignment.',
  jsonb_build_object('rule_id', rule.id, 'base_rate_key', rule.base_rate_key, 'spread_pct', rule.spread_pct)
from public.quote_components component
join public.quote_charge_rules rule on rule.quote_component_id = component.id and rule.active
where rule.rate_type = 'base_plus_spread' and upper(rule.base_rate_key) = 'TERM_SOFR'
on conflict do nothing;

with single_rule as (
  select quote_component_id, min(id::text)::uuid as rule_id
  from public.quote_charge_rules
  where active
  group by quote_component_id
  having count(*) = 1
), migrated_source as (
  select
    component.id as component_id,
    component.active as component_active,
    package.currency as package_currency,
    rule.*
  from single_rule
  join public.quote_components component on component.id = single_rule.quote_component_id
  join public.quote_charge_rules rule on rule.id = single_rule.rule_id
  join public.quote_packages package on package.id = component.quote_package_id
)
update public.quote_components component
set
  charge_type = source.charge_type,
  payer = source.payer,
  rate_type = source.rate_type,
  fixed_rate_pct = source.fixed_rate_pct,
  reference_rate_index_id = index.id,
  spread_pct = source.spread_pct,
  fixed_amount = source.fixed_amount,
  day_count_basis = source.day_count_basis,
  min_fee_amount = source.min_fee_amount,
  min_fee_frequency = source.min_fee_frequency,
  suggested_start_event = case
    when source.start_offset_days <> 0 then null
    when source.start_anchor::text = 'LC_ISSUE_DAY' then 'LC_ISSUE_DAY'::public.timeline_event_type
    when source.start_anchor::text = 'SHIPMENT_DAY' then 'SHIPMENT_DAY'::public.timeline_event_type
    when source.start_anchor::text = 'DISCOUNT_START_DAY' then 'SUPPLIER_PAYMENT_DAY'::public.timeline_event_type
    when source.start_anchor::text = 'FINAL_MATURITY_DAY' then 'FINAL_MATURITY_DAY'::public.timeline_event_type
    else null
  end,
  suggested_end_event = case
    when source.end_offset_days <> 0 then null
    when source.end_anchor::text = 'LC_ISSUE_DAY' then 'LC_ISSUE_DAY'::public.timeline_event_type
    when source.end_anchor::text = 'SHIPMENT_DAY' then 'SHIPMENT_DAY'::public.timeline_event_type
    when source.end_anchor::text = 'DISCOUNT_START_DAY' then 'SUPPLIER_PAYMENT_DAY'::public.timeline_event_type
    when source.end_anchor::text = 'FINAL_MATURITY_DAY' then 'FINAL_MATURITY_DAY'::public.timeline_event_type
    else null
  end,
  display_order = source.display_order,
  active = source.component_active
    and source.start_offset_days = 0
    and source.end_offset_days = 0
    and not (source.rate_type = 'base_plus_spread' and upper(source.base_rate_key) = 'TERM_SOFR')
from migrated_source source
left join public.reference_rate_indices index
  on index.currency = upper(source.package_currency)
  and source.rate_type = 'base_plus_spread'
  and index.rate_family = case upper(source.base_rate_key)
    when 'COF' then 'COF'::public.reference_rate_family
    when 'TERM_SHIBOR' then 'TERM_SHIBOR'::public.reference_rate_family
    when 'TERM_SOFR' then 'TERM_SOFR'::public.reference_rate_family
    else 'OTHER'::public.reference_rate_family
  end
  and index.tenor_months is null
where component.id = source.component_id;

update public.quote_components
set active = false
where rate_type is null
   or charge_type is null
   or (rate_type = 'base_plus_spread' and reference_rate_index_id is null);

alter table public.quote_components validate constraint quote_component_pricing_check;

alter table public.issuing_bank_fee_rules
  add column payer public.payer_type not null default 'applicant',
  add column reference_rate_index_id uuid references public.reference_rate_indices(id),
  add column suggested_start_event public.timeline_event_type,
  add column suggested_end_event public.timeline_event_type,
  add column display_order integer not null default 100;

update public.issuing_bank_fee_rules rule
set
  suggested_start_event = case
    when rule.start_offset_days <> 0 then null
    when rule.start_anchor::text = 'LC_ISSUE_DAY' then 'LC_ISSUE_DAY'::public.timeline_event_type
    when rule.start_anchor::text = 'SHIPMENT_DAY' then 'SHIPMENT_DAY'::public.timeline_event_type
    when rule.start_anchor::text = 'DISCOUNT_START_DAY' then 'SUPPLIER_PAYMENT_DAY'::public.timeline_event_type
    when rule.start_anchor::text = 'FINAL_MATURITY_DAY' then 'FINAL_MATURITY_DAY'::public.timeline_event_type
    else null
  end,
  suggested_end_event = case
    when rule.end_offset_days <> 0 then null
    when rule.end_anchor::text = 'LC_ISSUE_DAY' then 'LC_ISSUE_DAY'::public.timeline_event_type
    when rule.end_anchor::text = 'SHIPMENT_DAY' then 'SHIPMENT_DAY'::public.timeline_event_type
    when rule.end_anchor::text = 'DISCOUNT_START_DAY' then 'SUPPLIER_PAYMENT_DAY'::public.timeline_event_type
    when rule.end_anchor::text = 'FINAL_MATURITY_DAY' then 'FINAL_MATURITY_DAY'::public.timeline_event_type
    else null
  end;

update public.issuing_bank_fee_rules rule
set reference_rate_index_id = index.id
from public.reference_rate_indices index
where rule.rate_type = 'base_plus_spread'
  and index.currency = upper(rule.currency)
  and index.rate_family = case upper(rule.base_rate_key)
    when 'COF' then 'COF'::public.reference_rate_family
    when 'TERM_SHIBOR' then 'TERM_SHIBOR'::public.reference_rate_family
    when 'TERM_SOFR' then 'TERM_SOFR'::public.reference_rate_family
    else 'OTHER'::public.reference_rate_family
  end
  and index.tenor_months is null;

insert into public.migration_review_items (migration_key, object_type, object_id, reason, legacy_values)
select
  'direct_fee_periods_term_sofr', 'issuing_bank_fee_rule', id,
  case when upper(base_rate_key) = 'TERM_SOFR'
    then 'Generic TERM_SOFR pricing requires manual tenor assignment.'
    else 'Non-zero fee-period offset requires manual review.' end,
  jsonb_build_object(
    'base_rate_key', base_rate_key, 'start_anchor', start_anchor, 'start_offset_days', start_offset_days,
    'end_anchor', end_anchor, 'end_offset_days', end_offset_days
  )
from public.issuing_bank_fee_rules
where start_offset_days <> 0 or end_offset_days <> 0 or upper(base_rate_key) = 'TERM_SOFR'
on conflict do nothing;

update public.issuing_bank_fee_rules
set active = false
where (start_offset_days <> 0 or end_offset_days <> 0)
   or (rate_type = 'base_plus_spread' and reference_rate_index_id is null);

alter table public.calculation_runs
  add column shipment_days_after_trade_start integer,
  add column lc_issue_timing public.lc_issue_timing,
  add column lc_issue_offset_days integer,
  add column supplier_payment_days_after_shipment integer,
  add column deposit_day integer,
  add column reference_rate_as_of_date date,
  add column include_discounting_under_confirmation boolean;

update public.calculation_runs
set
  shipment_days_after_trade_start = shipment_days_after_lc_issue,
  lc_issue_timing = case when shipment_days_after_lc_issue = 0 then 'ON_SHIPMENT'::public.lc_issue_timing else 'BEFORE_SHIPMENT'::public.lc_issue_timing end,
  lc_issue_offset_days = shipment_days_after_lc_issue,
  supplier_payment_days_after_shipment = coalesce((confirmation_options_json ->> 'discountStartDaysAfterShipment')::integer, 0),
  reference_rate_as_of_date = created_at::date,
  include_discounting_under_confirmation = coalesce((confirmation_options_json ->> 'includeDiscounting')::boolean, false);

alter table public.calculation_runs
  alter column shipment_days_after_trade_start set not null,
  alter column lc_issue_timing set not null,
  alter column lc_issue_offset_days set not null,
  alter column supplier_payment_days_after_shipment set not null,
  alter column reference_rate_as_of_date set not null,
  alter column include_discounting_under_confirmation set not null;

alter table public.calculation_runs
  add constraint calculation_run_timeline_check check (
    shipment_days_after_trade_start >= 0 and lc_issue_offset_days >= 0
    and supplier_payment_days_after_shipment >= 0 and (deposit_day is null or deposit_day >= 0)
  );

alter table public.calculation_results
  add column solution_path public.solution_path,
  add column includes_discounting boolean not null default false,
  add column confirmation_cost numeric(18, 6) not null default 0,
  add column deferred_cost numeric(18, 6) not null default 0,
  add column discounting_cost numeric(18, 6) not null default 0,
  add column forfaiting_cost numeric(18, 6) not null default 0;

update public.calculation_results
set solution_path = coalesce((result_json ->> 'solutionPath')::public.solution_path, 'CONFIRMATION');

alter table public.calculation_results alter column solution_path set not null;
create unique index calculation_results_run_package_path_idx
  on public.calculation_results (calculation_run_id, quote_package_id, solution_path);

alter table public.calculation_result_lines drop constraint if exists calculation_result_lines_source_type_check;
alter table public.calculation_result_lines
  add column quote_component_id uuid references public.quote_components(id),
  add column issuing_bank_fee_rule_id uuid references public.issuing_bank_fee_rules(id),
  add column component_type public.quote_component_type,
  add column start_preset public.timeline_event_type,
  add column end_preset public.timeline_event_type,
  add column period_input_mode public.period_input_mode,
  add column min_fee_amount numeric(18, 2),
  add column min_fee_frequency public.min_fee_frequency not null default 'none',
  add column reference_rate_index_id uuid references public.reference_rate_indices(id),
  add column reference_rate_value_id uuid references public.reference_rate_values(id),
  add column reference_rate_family public.reference_rate_family,
  add column reference_rate_display_name text,
  add column reference_rate_currency text,
  add column reference_rate_tenor_months integer,
  add column reference_rate_effective_date date;

alter table public.calculation_result_lines
  add constraint calculation_result_lines_source_type_check check (
    source_type in ('quote_component', 'issuing_bank_fee_rule', 'quote_charge_rule')
  );

create table public.calculation_component_periods (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.calculation_runs(id) on delete cascade,
  quote_component_id uuid not null references public.quote_components(id),
  solution_path public.solution_path not null,
  start_day integer not null,
  end_day integer not null,
  charge_days integer not null,
  start_preset public.timeline_event_type,
  end_preset public.timeline_event_type,
  period_input_mode public.period_input_mode not null default 'MANUAL',
  created_at timestamptz not null default now(),
  constraint calculation_component_period_days_check check (
    start_day >= 0 and end_day >= start_day and charge_days = end_day - start_day
  ),
  constraint calculation_component_period_unique unique (calculation_run_id, quote_component_id, solution_path)
);

create table public.calculation_issuing_fee_periods (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.calculation_runs(id) on delete cascade,
  issuing_bank_fee_rule_id uuid not null references public.issuing_bank_fee_rules(id),
  solution_path public.solution_path not null,
  start_day integer not null,
  end_day integer not null,
  charge_days integer not null,
  start_preset public.timeline_event_type,
  end_preset public.timeline_event_type,
  period_input_mode public.period_input_mode not null default 'MANUAL',
  created_at timestamptz not null default now(),
  constraint calculation_issuing_fee_period_days_check check (
    start_day >= 0 and end_day >= start_day and charge_days = end_day - start_day
  ),
  constraint calculation_issuing_fee_period_unique unique (calculation_run_id, issuing_bank_fee_rule_id, solution_path)
);

create index reference_rate_value_lookup_idx
  on public.reference_rate_values (reference_rate_index_id, active, effective_date desc);
create index calculation_component_period_run_idx on public.calculation_component_periods (calculation_run_id);
create index calculation_issuing_fee_period_run_idx on public.calculation_issuing_fee_periods (calculation_run_id);

create trigger reference_rate_indices_set_updated_at before update on public.reference_rate_indices
for each row execute function public.set_updated_at();
create trigger reference_rate_values_set_updated_at before update on public.reference_rate_values
for each row execute function public.set_updated_at();

alter table public.reference_rate_indices enable row level security;
alter table public.reference_rate_values enable row level security;
alter table public.migration_review_items enable row level security;
alter table public.calculation_component_periods enable row level security;
alter table public.calculation_issuing_fee_periods enable row level security;

create policy "Authenticated users can read reference rate indices" on public.reference_rate_indices
for select to authenticated using (true);
create policy "Authenticated users can read reference rate values" on public.reference_rate_values
for select to authenticated using (true);

create policy "Admins and editors can insert reference rate indices" on public.reference_rate_indices
for insert to authenticated with check (public.current_user_role() in ('admin', 'editor'));
create policy "Admins and editors can update reference rate indices" on public.reference_rate_indices
for update to authenticated using (public.current_user_role() in ('admin', 'editor'))
with check (public.current_user_role() in ('admin', 'editor'));
create policy "Admins can delete reference rate indices" on public.reference_rate_indices
for delete to authenticated using (public.current_user_role() = 'admin');

create policy "Admins and editors can insert reference rate values" on public.reference_rate_values
for insert to authenticated with check (public.current_user_role() in ('admin', 'editor'));
create policy "Admins and editors can update reference rate values" on public.reference_rate_values
for update to authenticated using (public.current_user_role() in ('admin', 'editor'))
with check (public.current_user_role() in ('admin', 'editor'));
create policy "Admins can delete reference rate values" on public.reference_rate_values
for delete to authenticated using (public.current_user_role() = 'admin');

create policy "Admins can read migration review items" on public.migration_review_items
for select to authenticated using (public.current_user_role() = 'admin');
create policy "Admins can update migration review items" on public.migration_review_items
for update to authenticated using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "Users can insert own component periods" on public.calculation_component_periods
for insert to authenticated with check (exists (
  select 1 from public.calculation_runs run
  where run.id = calculation_component_periods.calculation_run_id and run.user_id = (select auth.uid())
));
create policy "Users can read own component periods" on public.calculation_component_periods
for select to authenticated using (exists (
  select 1 from public.calculation_runs run
  where run.id = calculation_component_periods.calculation_run_id and run.user_id = (select auth.uid())
) or public.current_user_role() = 'admin');

create policy "Users can insert own issuing fee periods" on public.calculation_issuing_fee_periods
for insert to authenticated with check (exists (
  select 1 from public.calculation_runs run
  where run.id = calculation_issuing_fee_periods.calculation_run_id and run.user_id = (select auth.uid())
));
create policy "Users can read own issuing fee periods" on public.calculation_issuing_fee_periods
for select to authenticated using (exists (
  select 1 from public.calculation_runs run
  where run.id = calculation_issuing_fee_periods.calculation_run_id and run.user_id = (select auth.uid())
) or public.current_user_role() = 'admin');

grant select on public.reference_rate_indices, public.reference_rate_values to authenticated;
grant insert, update, delete on public.reference_rate_indices, public.reference_rate_values to authenticated;
grant select, update on public.migration_review_items to authenticated;
grant select, insert on public.calculation_component_periods, public.calculation_issuing_fee_periods to authenticated;
grant select on public.profiles, public.institutions, public.issuing_banks, public.quote_packages,
  public.quote_package_issuing_banks, public.quote_components, public.issuing_bank_fee_rules to authenticated;
grant insert, update, delete on public.institutions, public.issuing_banks, public.quote_packages,
  public.quote_package_issuing_banks, public.quote_components, public.issuing_bank_fee_rules to authenticated;
grant select, insert on public.calculation_runs, public.calculation_results, public.calculation_result_lines to authenticated;

create or replace function public.persist_calculation(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_result_id uuid;
  v_result jsonb;
  v_line jsonb;
  v_period jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  insert into public.calculation_runs (
    user_id, issuing_bank_id, currency, transaction_amount,
    shipment_days_after_lc_issue, maturity_basis, maturity_days, selected_paths, confirmation_options_json,
    shipment_days_after_trade_start, lc_issue_timing, lc_issue_offset_days,
    supplier_payment_days_after_shipment, deposit_day, reference_rate_as_of_date,
    include_discounting_under_confirmation, assumptions_json
  ) values (
    (select auth.uid()), (p_payload ->> 'issuing_bank_id')::uuid, p_payload ->> 'currency',
    (p_payload ->> 'transaction_amount')::numeric,
    (p_payload #>> '{legacy,shipment_days_after_lc_issue}')::integer,
    (p_payload #>> '{trade_timeline,maturity_basis}')::public.maturity_basis,
    (p_payload #>> '{trade_timeline,maturity_days}')::integer,
    array(select jsonb_array_elements_text(p_payload -> 'selected_paths')),
    jsonb_build_object('includeDiscounting', (p_payload ->> 'include_discounting')::boolean),
    (p_payload #>> '{trade_timeline,shipment_days_after_trade_start}')::integer,
    (p_payload #>> '{trade_timeline,lc_issue_timing}')::public.lc_issue_timing,
    (p_payload #>> '{trade_timeline,lc_issue_offset_days}')::integer,
    (p_payload #>> '{trade_timeline,supplier_payment_days_after_shipment}')::integer,
    (p_payload #>> '{trade_timeline,deposit_day}')::integer,
    (p_payload ->> 'reference_rate_as_of_date')::date,
    (p_payload ->> 'include_discounting')::boolean,
    p_payload -> 'timeline'
  ) returning id into v_run_id;

  for v_result in select value from jsonb_array_elements(p_payload -> 'results') loop
    insert into public.calculation_results (
      calculation_run_id, quote_package_id, institution_id, solution_path, includes_discounting,
      eligible, ineligibility_reason, external_quote_cost, issuing_bank_cost, total_cost, all_in_pct,
      confirmation_cost, deferred_cost, discounting_cost, forfaiting_cost, result_json
    ) values (
      v_run_id, (v_result ->> 'quote_package_id')::uuid, (v_result ->> 'institution_id')::uuid,
      (v_result ->> 'solution_path')::public.solution_path,
      coalesce((v_result ->> 'includes_discounting')::boolean, false),
      (v_result ->> 'eligible')::boolean, v_result ->> 'ineligibility_reason',
      coalesce((v_result ->> 'external_quote_cost')::numeric, 0),
      coalesce((v_result ->> 'issuing_bank_cost')::numeric, 0),
      coalesce((v_result ->> 'total_cost')::numeric, 0), coalesce((v_result ->> 'all_in_pct')::numeric, 0),
      coalesce((v_result ->> 'confirmation_cost')::numeric, 0), coalesce((v_result ->> 'deferred_cost')::numeric, 0),
      coalesce((v_result ->> 'discounting_cost')::numeric, 0), coalesce((v_result ->> 'forfaiting_cost')::numeric, 0),
      v_result
    ) returning id into v_result_id;

    for v_line in select value from jsonb_array_elements(coalesce(v_result -> 'lines', '[]'::jsonb)) loop
      insert into public.calculation_result_lines (
        calculation_result_id, source_type, source_rule_id, quote_component_id, issuing_bank_fee_rule_id,
        component_type, charge_type, payer, start_day, end_day, charge_days, start_preset, end_preset,
        period_input_mode, amount, rate_type, fixed_rate_pct, base_rate_pct, spread_pct, effective_rate_pct,
        fixed_amount, day_count_basis, min_fee_amount, min_fee_frequency, calculated_fee, final_fee,
        formula_text, excel_formula_template, display_order, reference_rate_index_id, reference_rate_value_id,
        reference_rate_family, reference_rate_display_name, reference_rate_currency,
        reference_rate_tenor_months, reference_rate_effective_date
      ) values (
        v_result_id, v_line ->> 'source_type', (v_line ->> 'source_id')::uuid,
        (v_line ->> 'quote_component_id')::uuid, (v_line ->> 'issuing_bank_fee_rule_id')::uuid,
        (v_line ->> 'component_type')::public.quote_component_type,
        (v_line ->> 'charge_type')::public.charge_type, (v_line ->> 'payer')::public.payer_type,
        (v_line ->> 'start_day')::integer, (v_line ->> 'end_day')::integer, (v_line ->> 'charge_days')::integer,
        (v_line ->> 'start_preset')::public.timeline_event_type, (v_line ->> 'end_preset')::public.timeline_event_type,
        (v_line ->> 'period_input_mode')::public.period_input_mode, (v_line ->> 'amount')::numeric,
        (v_line ->> 'rate_type')::public.rate_type, (v_line ->> 'fixed_rate_pct')::numeric,
        (v_line ->> 'base_rate_pct')::numeric, (v_line ->> 'spread_pct')::numeric,
        (v_line ->> 'effective_rate_pct')::numeric, (v_line ->> 'fixed_amount')::numeric,
        (v_line ->> 'day_count_basis')::integer, (v_line ->> 'min_fee_amount')::numeric,
        coalesce((v_line ->> 'min_fee_frequency')::public.min_fee_frequency, 'none'),
        (v_line ->> 'calculated_fee')::numeric, (v_line ->> 'final_fee')::numeric,
        v_line ->> 'formula_text', v_line ->> 'excel_formula_template', (v_line ->> 'display_order')::integer,
        (v_line ->> 'reference_rate_index_id')::uuid, (v_line ->> 'reference_rate_value_id')::uuid,
        (v_line ->> 'reference_rate_family')::public.reference_rate_family,
        v_line ->> 'reference_rate_display_name', v_line ->> 'reference_rate_currency',
        (v_line ->> 'reference_rate_tenor_months')::integer,
        (v_line ->> 'reference_rate_effective_date')::date
      );
    end loop;
  end loop;

  for v_period in select value from jsonb_array_elements(coalesce(p_payload -> 'component_periods', '[]'::jsonb)) loop
    insert into public.calculation_component_periods (
      calculation_run_id, quote_component_id, solution_path, start_day, end_day, charge_days,
      start_preset, end_preset, period_input_mode
    ) values (
      v_run_id, (v_period ->> 'quote_component_id')::uuid, (v_period ->> 'solution_path')::public.solution_path,
      (v_period ->> 'start_day')::integer, (v_period ->> 'end_day')::integer,
      (v_period ->> 'charge_days')::integer, (v_period ->> 'start_preset')::public.timeline_event_type,
      (v_period ->> 'end_preset')::public.timeline_event_type,
      (v_period ->> 'period_input_mode')::public.period_input_mode
    );
  end loop;

  for v_period in select value from jsonb_array_elements(coalesce(p_payload -> 'issuing_fee_periods', '[]'::jsonb)) loop
    insert into public.calculation_issuing_fee_periods (
      calculation_run_id, issuing_bank_fee_rule_id, solution_path, start_day, end_day, charge_days,
      start_preset, end_preset, period_input_mode
    ) values (
      v_run_id, (v_period ->> 'issuing_bank_fee_rule_id')::uuid,
      (v_period ->> 'solution_path')::public.solution_path,
      (v_period ->> 'start_day')::integer, (v_period ->> 'end_day')::integer,
      (v_period ->> 'charge_days')::integer, (v_period ->> 'start_preset')::public.timeline_event_type,
      (v_period ->> 'end_preset')::public.timeline_event_type,
      (v_period ->> 'period_input_mode')::public.period_input_mode
    );
  end loop;

  return v_run_id;
end;
$$;

revoke all on function public.persist_calculation(jsonb) from public, anon;
grant execute on function public.persist_calculation(jsonb) to authenticated;
