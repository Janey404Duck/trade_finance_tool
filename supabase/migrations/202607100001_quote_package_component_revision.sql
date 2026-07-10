do $$
begin
  create type public.quote_component_type as enum (
    'CONFIRMATION',
    'DEFERRED',
    'DISCOUNTING',
    'FORFAITING',
    'OTHER'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.maturity_basis as enum (
    'AFTER_SHIPMENT',
    'AFTER_LC_ISSUANCE'
  );
exception
  when duplicate_object then null;
end;
$$;

alter type public.charge_type rename to charge_type_legacy;

create type public.charge_type as enum (
  'CONFIRMATION_FEE',
  'DEFERRED_PAYMENT_FEE',
  'DISCOUNTING_FEE',
  'FORFAITING_FEE',
  'HANDLING_FEE',
  'ISSUING_BANK_FEE',
  'OTHER'
);

alter type public.anchor_type rename to anchor_type_legacy;

create type public.anchor_type as enum (
  'LC_ISSUE_DAY',
  'SHIPMENT_DAY',
  'DISCOUNT_START_DAY',
  'FINAL_MATURITY_DAY'
);

alter table public.quotes rename to quote_packages;
alter table public.quote_packages rename column quote_name to package_name;
alter table public.quote_packages drop constraint if exists quotes_financing_confirmation_check;
alter table public.quote_packages drop column if exists financing_type;
alter table public.quote_packages drop column if exists requires_confirmation;

alter table public.quote_issuing_banks rename to quote_package_issuing_banks;
alter table public.quote_package_issuing_banks rename column quote_id to quote_package_id;

alter index if exists quotes_lookup_idx rename to quote_packages_lookup_idx;
alter index if exists quote_issuing_banks_quote_idx rename to quote_package_issuing_banks_package_idx;

create table public.quote_components (
  id uuid primary key default gen_random_uuid(),
  quote_package_id uuid not null references public.quote_packages(id) on delete cascade,
  component_type public.quote_component_type not null,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quote_components_package_idx on public.quote_components (quote_package_id, active, component_type);

alter table public.quote_charge_rules rename to quote_charge_rules_legacy;
alter index if exists quote_charge_rules_quote_idx rename to quote_charge_rules_legacy_quote_idx;

create table public.quote_charge_rules (
  id uuid primary key default gen_random_uuid(),
  quote_component_id uuid not null references public.quote_components(id) on delete cascade,
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

insert into public.quote_components (quote_package_id, component_type, active, notes, created_by, updated_by)
select
  legacy.quote_id,
  legacy.component_type,
  true,
  'Migrated from quote-level charge rules.',
  null,
  null
from (
  select distinct
    quote_id,
    case charge_type::text
      when 'confirmation' then 'CONFIRMATION'::public.quote_component_type
      when 'deferred' then 'DEFERRED'::public.quote_component_type
      when 'discounting' then 'DISCOUNTING'::public.quote_component_type
      when 'forfaiting' then 'FORFAITING'::public.quote_component_type
      else 'OTHER'::public.quote_component_type
    end as component_type
  from public.quote_charge_rules_legacy
) legacy;

insert into public.quote_charge_rules (
  id,
  quote_component_id,
  charge_type,
  payer,
  rate_type,
  fixed_rate_pct,
  base_rate_key,
  spread_pct,
  fixed_amount,
  amount_basis,
  day_count_basis,
  start_anchor,
  start_offset_days,
  end_anchor,
  end_offset_days,
  min_fee_amount,
  min_fee_frequency,
  display_order,
  active,
  notes,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  legacy.id,
  component.id,
  case legacy.charge_type::text
    when 'confirmation' then 'CONFIRMATION_FEE'::public.charge_type
    when 'deferred' then 'DEFERRED_PAYMENT_FEE'::public.charge_type
    when 'discounting' then 'DISCOUNTING_FEE'::public.charge_type
    when 'forfaiting' then 'FORFAITING_FEE'::public.charge_type
    when 'handling' then 'HANDLING_FEE'::public.charge_type
    else 'OTHER'::public.charge_type
  end,
  legacy.payer,
  legacy.rate_type,
  legacy.fixed_rate_pct,
  legacy.base_rate_key,
  legacy.spread_pct,
  legacy.fixed_amount,
  legacy.amount_basis,
  legacy.day_count_basis,
  case
    when legacy.start_anchor is null then null
    when legacy.start_anchor::text = 'SUPPLIER_PAYMENT_DAY' then 'DISCOUNT_START_DAY'::public.anchor_type
    else legacy.start_anchor::text::public.anchor_type
  end,
  legacy.start_offset_days,
  case
    when legacy.end_anchor is null then null
    when legacy.end_anchor::text = 'SUPPLIER_PAYMENT_DAY' then 'DISCOUNT_START_DAY'::public.anchor_type
    else legacy.end_anchor::text::public.anchor_type
  end,
  legacy.end_offset_days,
  legacy.min_fee_amount,
  legacy.min_fee_frequency,
  legacy.display_order,
  legacy.active,
  legacy.notes,
  legacy.created_by,
  legacy.updated_by,
  legacy.created_at,
  legacy.updated_at
from public.quote_charge_rules_legacy legacy
join public.quote_components component
  on component.quote_package_id = legacy.quote_id
  and component.component_type = case legacy.charge_type::text
    when 'confirmation' then 'CONFIRMATION'::public.quote_component_type
    when 'deferred' then 'DEFERRED'::public.quote_component_type
    when 'discounting' then 'DISCOUNTING'::public.quote_component_type
    when 'forfaiting' then 'FORFAITING'::public.quote_component_type
    else 'OTHER'::public.quote_component_type
  end;

alter table public.issuing_bank_fee_rules
alter column charge_type drop default;

alter table public.issuing_bank_fee_rules
alter column charge_type type public.charge_type
using case charge_type::text
  when 'issuing_fee' then 'ISSUING_BANK_FEE'::public.charge_type
  when 'handling' then 'HANDLING_FEE'::public.charge_type
  else 'OTHER'::public.charge_type
end;

alter table public.issuing_bank_fee_rules
alter column start_anchor type public.anchor_type
using case
  when start_anchor is null then null
  when start_anchor::text = 'SUPPLIER_PAYMENT_DAY' then 'DISCOUNT_START_DAY'::public.anchor_type
  else start_anchor::text::public.anchor_type
end;

alter table public.issuing_bank_fee_rules
alter column end_anchor type public.anchor_type
using case
  when end_anchor is null then null
  when end_anchor::text = 'SUPPLIER_PAYMENT_DAY' then 'DISCOUNT_START_DAY'::public.anchor_type
  else end_anchor::text::public.anchor_type
end;

alter table public.issuing_bank_fee_rules
alter column charge_type set default 'ISSUING_BANK_FEE'::public.charge_type;

alter table public.calculation_result_lines
alter column charge_type type public.charge_type
using case charge_type::text
  when 'confirmation' then 'CONFIRMATION_FEE'::public.charge_type
  when 'deferred' then 'DEFERRED_PAYMENT_FEE'::public.charge_type
  when 'discounting' then 'DISCOUNTING_FEE'::public.charge_type
  when 'forfaiting' then 'FORFAITING_FEE'::public.charge_type
  when 'issuing_fee' then 'ISSUING_BANK_FEE'::public.charge_type
  when 'handling' then 'HANDLING_FEE'::public.charge_type
  else 'OTHER'::public.charge_type
end;

alter table public.calculation_result_lines
alter column start_anchor type public.anchor_type
using case
  when start_anchor is null then null
  when start_anchor::text = 'SUPPLIER_PAYMENT_DAY' then 'DISCOUNT_START_DAY'::public.anchor_type
  else start_anchor::text::public.anchor_type
end;

alter table public.calculation_result_lines
alter column end_anchor type public.anchor_type
using case
  when end_anchor is null then null
  when end_anchor::text = 'SUPPLIER_PAYMENT_DAY' then 'DISCOUNT_START_DAY'::public.anchor_type
  else end_anchor::text::public.anchor_type
end;

drop table public.quote_charge_rules_legacy;

drop type public.charge_type_legacy;
drop type public.anchor_type_legacy;

alter table public.calculation_runs
add column shipment_days_after_lc_issue integer;

update public.calculation_runs
set shipment_days_after_lc_issue = shipment_days;

alter table public.calculation_runs
alter column shipment_days_after_lc_issue set not null;

alter table public.calculation_runs
add column maturity_basis public.maturity_basis not null default 'AFTER_SHIPMENT';

alter table public.calculation_runs
add column maturity_days integer;

update public.calculation_runs
set maturity_days = lc_maturity_days;

alter table public.calculation_runs
alter column maturity_days set not null;

alter table public.calculation_runs
add column selected_paths text[] not null default array['CONFIRMATION', 'FORFAITING'];

alter table public.calculation_runs
add column confirmation_options_json jsonb not null default '{}'::jsonb;

alter table public.calculation_runs
add constraint calculation_runs_selected_paths_check check (
  selected_paths <@ array['CONFIRMATION', 'FORFAITING']::text[]
);

alter table public.calculation_runs drop column lc_maturity_days;
alter table public.calculation_runs drop column shipment_days;
alter table public.calculation_runs drop column payment_terms_days;

alter table public.calculation_results rename column quote_id to quote_package_id;

create index quote_charge_rules_component_idx on public.quote_charge_rules (quote_component_id, active, display_order);

create trigger quote_packages_set_updated_at
before update on public.quote_packages
for each row execute function public.set_updated_at();

create trigger quote_components_set_updated_at
before update on public.quote_components
for each row execute function public.set_updated_at();

create trigger quote_charge_rules_set_updated_at
before update on public.quote_charge_rules
for each row execute function public.set_updated_at();

alter table public.quote_components enable row level security;
alter table public.quote_charge_rules enable row level security;

create policy "Authenticated users can read quote components"
on public.quote_components
for select
to authenticated
using (true);

create policy "Admins and editors can insert quote components"
on public.quote_components
for insert
to authenticated
with check (public.current_user_role() in ('admin', 'editor'));

create policy "Admins and editors can update quote components"
on public.quote_components
for update
to authenticated
using (public.current_user_role() in ('admin', 'editor'))
with check (public.current_user_role() in ('admin', 'editor'));

create policy "Admins can delete quote components"
on public.quote_components
for delete
to authenticated
using (public.current_user_role() = 'admin');

create policy "Authenticated users can read quote charge rules"
on public.quote_charge_rules
for select
to authenticated
using (true);

create policy "Admins and editors can insert quote charge rules"
on public.quote_charge_rules
for insert
to authenticated
with check (public.current_user_role() in ('admin', 'editor'));

create policy "Admins and editors can update quote charge rules"
on public.quote_charge_rules
for update
to authenticated
using (public.current_user_role() in ('admin', 'editor'))
with check (public.current_user_role() in ('admin', 'editor'));

create policy "Admins can delete quote charge rules"
on public.quote_charge_rules
for delete
to authenticated
using (public.current_user_role() = 'admin');
