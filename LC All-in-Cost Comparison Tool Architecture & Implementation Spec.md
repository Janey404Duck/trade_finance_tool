
## 0. Product Summary

Build a multi-user web app to compare all-in-cost across different bank / trading house quotations for LC-related financing.

The app calculates financing cost based on:

- issuing bank
- transaction amount
- currency
- LC maturity days
- shipment days
- supplier payment terms days
- active quotation rules
- reference rates such as TERM SOFR, TERM SHIBOR, COF
- issuing bank fee rules
- institution / issuing bank eligibility

The app must support:

- quote input / maintenance page
- calculation page
- summary result table
- detailed charge breakdown
- Excel export with formulas for verification
- user login
- role-based permissions
- Supabase database persistence

Use shipment as the central proxy anchor.

Do not model document presentation date, taking-up-documents date, or issuing-bank acceptance date in MVP.

## 1. Recommended Tech Stack

Use:

```
Next.js App Router
TypeScript
Supabase Postgres
Supabase Auth
Supabase Row Level Security
ExcelJS
Zod
Tailwind CSS or shadcn/ui
Vitest
```

Do not use a separate FastAPI backend for MVP.

All backend logic should live inside Next.js server-side modules and Route Handlers.

## 2. High-Level Architecture

```
Browser UI
  |
  | Next.js pages / components
  |
Next.js Route Handlers
  |
  | call calculation engine
  | call Supabase server client
  | generate Excel exports
  |
Supabase Postgres
  |
Supabase Auth + RLS
```

Core folders:

```
/app
  /(auth)/login/page.tsx
  /(app)/dashboard/page.tsx
  /(app)/calculate/page.tsx
  /(app)/quotes/page.tsx
  /(app)/quotes/[id]/page.tsx
  /(app)/reference-rates/page.tsx
  /(app)/issuing-bank-fees/page.tsx
  /api/calculate/route.ts
  /api/export-excel/route.ts

/components
  /forms
  /tables
  /layout
  /ui

/lib
  /calc
    anchors.ts
    types.ts
    resolveAnchorDay.ts
    resolveRate.ts
    calculateChargeRule.ts
    calculateQuote.ts
    calculateScenario.ts
    formulas.ts
  /excel
    buildWorkbook.ts
    sheets.ts
  /supabase
    browser.ts
    server.ts
    admin.ts
  /auth
    roles.ts
    requireUser.ts
  /validation
    calculateSchemas.ts
    quoteSchemas.ts

/supabase
  /migrations
  /seed.sql

/tests
  /calc
    calculateScenario.test.ts
    calculateChargeRule.test.ts
```

## 3. Core Business Logic

### 3.1 User Inputs

The calculation input form should ask for:

|Field|Type|Required|Example|
|---|---|---|---|
|issuing_bank_id|UUID|Yes|Ziraat Bank|
|currency|enum|Yes|USD|
|transaction_amount|decimal|Yes|1000000|
|lc_maturity_days|integer|Yes|360|
|shipment_days|integer|Yes|30|
|payment_terms_days|integer|Yes|105|
|selected_quote_ids|UUID[]|No|optional manual filter|

There is no `add_confirmation` input.

Business rule:

- discounting quotes require confirmation
- forfaiting quotes do not require confirmation
- each quote defines its own financing type and charge legs

### 3.2 Canonical Timeline Anchors

Only use these anchors in MVP:

```
export const ANCHORS = [
  'LC_ISSUE_DAY',
  'SHIPMENT_DAY',
  'SUPPLIER_PAYMENT_DAY',
  'FINAL_MATURITY_DAY',
] as const;
```

Anchor resolution:

|   |   |
|---|---|
|Anchor|Formula|
|`LC_ISSUE_DAY`|`0`|
|`SHIPMENT_DAY`|`shipment_days`|
|`SUPPLIER_PAYMENT_DAY`|`shipment_days + payment_terms_days`|
|`FINAL_MATURITY_DAY`|`shipment_days + lc_maturity_days`|

Example:

```
shipment_days = 30
payment_terms_days = 105
lc_maturity_days = 360

LC_ISSUE_DAY = 0
SHIPMENT_DAY = 30
SUPPLIER_PAYMENT_DAY = 135
FINAL_MATURITY_DAY = 390
```

Charge days:

```
charge_days = end_anchor_day + end_offset_days - start_anchor_day - start_offset_days
```

If `charge_days < 0`, throw a validation error.

If `charge_days = 0`, fee is zero unless it is a flat transaction fee.

### 3.3 Quote Eligibility Logic

A quote is eligible when:

```
quote.active = true
currency matches input currency
valid_from <= today <= valid_to, if dates exist
transaction amount is within min_amount / max_amount, if limits exist
LC maturity is within min_maturity_days / max_maturity_days, if limits exist
issuing bank is accepted by quote
```

Issuing bank rule:

```
if quote.applies_to_all_issuing_banks = true:
    quote is eligible for any issuing bank

if quote.applies_to_all_issuing_banks = false:
    quote is eligible only when quote_issuing_banks contains the input issuing_bank_id
```

If no issuing bank is mentioned in the quotation, set:

```
applies_to_all_issuing_banks = true
```

Do not represent “all issuing banks” as a missing/null relationship.

### 3.4 Financing Type Logic

Allowed financing types:

```
type FinancingType =
  | 'confirmation'
  | 'discounting'
  | 'forfaiting'
  | 'mixed'
  | 'issuing_fee'
  | 'trading_house';
```

Default rule:

```
if financing_type === 'discounting':
  requires_confirmation = true;

if financing_type === 'forfaiting':
  requires_confirmation = false;
```

This is database data but should also be validated in application logic.

### 3.5 Charge Types

Allowed charge types:

```
type ChargeType =
  | 'confirmation'
  | 'deferred'
  | 'discounting'
  | 'forfaiting'
  | 'issuing_fee'
  | 'handling'
  | 'amendment'
  | 'other';
```

### 3.6 Rate Types

Allowed rate types:

```
type RateType =
  | 'flat_pct'
  | 'annual_pct'
  | 'base_plus_spread'
  | 'fixed_amount';
```

Formula rules:

#### Annual percentage

```
fee = amount × fixed_rate_pct / 100 × charge_days / day_count_basis
```

#### Flat percentage

```
fee = amount × fixed_rate_pct / 100
```

#### Base plus spread

```
effective_rate_pct = reference_rate_pct + spread_pct

fee = amount × effective_rate_pct / 100 × charge_days / day_count_basis
```

#### Fixed amount

```
fee = fixed_amount
```

#### Transaction minimum

```
fee = max(calculated_fee, min_fee_amount)
```

#### Monthly minimum

```
fee = max(calculated_fee, min_fee_amount × ceil(charge_days / 30))
```

### 3.7 All-in Cost

For each eligible quote:

```
external_quote_cost = sum(all active quote_charge_rules)
issuing_bank_cost = sum(all active issuing_bank_fee_rules for selected issuing bank)
total_cost = external_quote_cost + issuing_bank_cost
all_in_pct = total_cost / transaction_amount × 100
```

Return both:

```
external_quote_cost only
issuing_bank_cost only
total all-in cost
all-in percentage
```

## 4. Database Schema

Use Supabase Postgres.

Enable UUID extension:

```
create extension if not exists "pgcrypto";
```

### 4.1 Enums

```
create type institution_type as enum (
  'bank',
  'trading_house',
  'broker',
  'insurance_company',
  'other'
);

create type financing_type as enum (
  'confirmation',
  'discounting',
  'forfaiting',
  'mixed',
  'issuing_fee',
  'trading_house'
);

create type charge_type as enum (
  'confirmation',
  'deferred',
  'discounting',
  'forfaiting',
  'issuing_fee',
  'handling',
  'amendment',
  'other'
);

create type payer_type as enum (
  'applicant',
  'beneficiary',
  'shared',
  'unknown'
);

create type rate_type as enum (
  'flat_pct',
  'annual_pct',
  'base_plus_spread',
  'fixed_amount'
);

create type anchor_type as enum (
  'LC_ISSUE_DAY',
  'SHIPMENT_DAY',
  'SUPPLIER_PAYMENT_DAY',
  'FINAL_MATURITY_DAY'
);

create type min_fee_frequency as enum (
  'none',
  'transaction',
  'month'
);

create type user_role as enum (
  'admin',
  'editor',
  'viewer'
);
```

### 4.2 Profiles and Roles

Supabase Auth stores users in `auth.users`.

Create app-level profiles:

```
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 4.3 Institutions

```
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution_type institution_type not null,
  country text,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint institutions_name_unique unique (name)
);
```

Examples:

```
Natixis
QNB
Habib Bank
BOC
HSBC
Maersk
DP World
China Trade Solutions
```

### 4.4 Issuing Banks

```
create table public.issuing_banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'Türkiye',
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint issuing_banks_name_unique unique (name)
);
```

Examples:

```
Ziraat Bank
Halkbank
VakıfBank
Garanti BBVA
İşbank
```

### 4.5 Quotes

One quote header per institution quotation.

```
create table public.quotes (
  id uuid primary key default gen_random_uuid(),

  institution_id uuid not null references public.institutions(id) on delete restrict,

  quote_name text not null,
  currency text not null,
  financing_type financing_type not null,

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

  constraint quotes_amount_range_check check (
    min_amount is null or max_amount is null or min_amount <= max_amount
  ),

  constraint quotes_maturity_range_check check (
    min_maturity_days is null or max_maturity_days is null or min_maturity_days <= max_maturity_days
  )
);
```

Application validation:

```
if financing_type = 'discounting', requires_confirmation must be true
if financing_type = 'forfaiting', requires_confirmation must be false
```

### 4.6 Quote Eligible Issuing Banks

Only used when `quotes.applies_to_all_issuing_banks = false`.

```
create table public.quote_issuing_banks (
  id uuid primary key default gen_random_uuid(),

  quote_id uuid not null references public.quotes(id) on delete cascade,
  issuing_bank_id uuid not null references public.issuing_banks(id) on delete restrict,

  created_at timestamptz not null default now(),

  constraint quote_issuing_banks_unique unique (quote_id, issuing_bank_id)
);
```

### 4.7 Quote Charge Rules

This is the core table.

```
create table public.quote_charge_rules (
  id uuid primary key default gen_random_uuid(),

  quote_id uuid not null references public.quotes(id) on delete cascade,

  charge_type charge_type not null,
  payer payer_type not null default 'applicant',

  rate_type rate_type not null,

  fixed_rate_pct numeric(10, 6),
  base_rate_key text,
  spread_pct numeric(10, 6),
  fixed_amount numeric(18, 2),

  amount_basis text not null default 'transaction_amount',
  day_count_basis integer not null default 360,

  start_anchor anchor_type,
  start_offset_days integer not null default 0,
  end_anchor anchor_type,
  end_offset_days integer not null default 0,

  min_fee_amount numeric(18, 2),
  min_fee_frequency min_fee_frequency not null default 'none',

  display_order integer not null default 0,
  active boolean not null default true,
  notes text,

  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint day_count_basis_check check (day_count_basis in (360, 365)),

  constraint amount_basis_check check (amount_basis in ('transaction_amount')),

  constraint quote_charge_rule_rate_check check (
    (
      rate_type = 'flat_pct'
      and fixed_rate_pct is not null
    )
    or
    (
      rate_type = 'annual_pct'
      and fixed_rate_pct is not null
      and start_anchor is not null
      and end_anchor is not null
    )
    or
    (
      rate_type = 'base_plus_spread'
      and base_rate_key is not null
      and spread_pct is not null
      and start_anchor is not null
      and end_anchor is not null
    )
    or
    (
      rate_type = 'fixed_amount'
      and fixed_amount is not null
    )
  )
);
```

Examples:

```
Confirmation for whole LC:
start_anchor = LC_ISSUE_DAY
end_anchor = FINAL_MATURITY_DAY

Discounting from supplier payment to maturity:
start_anchor = SUPPLIER_PAYMENT_DAY
end_anchor = FINAL_MATURITY_DAY

Forfaiting from shipment to maturity:
start_anchor = SHIPMENT_DAY
end_anchor = FINAL_MATURITY_DAY
```

### 4.8 Reference Rates

Stores TERM SOFR / TERM SHIBOR / COF.

```
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
```

Examples:

```
TERM_SOFR / USD / 360 / 4.20
TERM_SHIBOR / RMB / 360 / 2.30
COF / USD / 360 / 4.20
```

Rate selection logic:

```
For a charge rule using base_rate_key:
1. match base_rate_key
2. match currency
3. prefer exact tenor_days if provided
4. otherwise use active latest rate_date
```

MVP can simply use latest active rate by `rate_key + currency`.

### 4.9 Issuing Bank Fee Rules

Keep issuing bank fees separate from external quotes.

```
create table public.issuing_bank_fee_rules (
  id uuid primary key default gen_random_uuid(),

  issuing_bank_id uuid not null references public.issuing_banks(id) on delete cascade,

  currency text not null,

  fee_name text not null,
  charge_type charge_type not null default 'issuing_fee',

  rate_type rate_type not null,

  fixed_rate_pct numeric(10, 6),
  base_rate_key text,
  spread_pct numeric(10, 6),
  fixed_amount numeric(18, 2),

  amount_basis text not null default 'transaction_amount',
  day_count_basis integer not null default 360,

  start_anchor anchor_type,
  start_offset_days integer not null default 0,
  end_anchor anchor_type,
  end_offset_days integer not null default 0,

  min_fee_amount numeric(18, 2),
  min_fee_frequency min_fee_frequency not null default 'none',

  active boolean not null default true,
  notes text,

  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint issuing_fee_day_count_basis_check check (day_count_basis in (360, 365)),

  constraint issuing_fee_amount_basis_check check (amount_basis in ('transaction_amount')),

  constraint issuing_fee_rate_check check (
    (
      rate_type = 'flat_pct'
      and fixed_rate_pct is not null
    )
    or
    (
      rate_type = 'annual_pct'
      and fixed_rate_pct is not null
      and start_anchor is not null
      and end_anchor is not null
    )
    or
    (
      rate_type = 'base_plus_spread'
      and base_rate_key is not null
      and spread_pct is not null
      and start_anchor is not null
      and end_anchor is not null
    )
    or
    (
      rate_type = 'fixed_amount'
      and fixed_amount is not null
    )
  )
);
```

Example:

```
Opening fee:
rate_type = flat_pct
fixed_rate_pct = 2.00
```

### 4.10 Calculation Runs

Store calculation history.

```
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
```

### 4.11 Calculation Results

One row per eligible quote result.

```
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
```

### 4.12 Calculation Result Lines

One row per calculated charge line.

```
create table public.calculation_result_lines (
  id uuid primary key default gen_random_uuid(),

  calculation_result_id uuid not null references public.calculation_results(id) on delete cascade,

  source_type text not null, -- quote_charge_rule / issuing_bank_fee_rule
  source_rule_id uuid,

  charge_type charge_type not null,
  payer payer_type not null,

  start_anchor anchor_type,
  end_anchor anchor_type,
  start_day integer,
  end_day integer,
  charge_days integer,

  amount_basis text not null,
  amount numeric(18, 2) not null,

  rate_type rate_type not null,
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

  constraint calculation_result_lines_source_type_check check (
    source_type in ('quote_charge_rule', 'issuing_bank_fee_rule')
  )
);
```

## 5. RLS and Permissions

Enable RLS on all public tables.

```
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
```

Create helper function:

```
create or replace function public.current_user_role()
returns user_role
language sql
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;
```

### 5.1 Profiles Policies

```
create policy "Users can read own profile"
on public.profiles
for select
using (id = auth.uid());

create policy "Admins can read all profiles"
on public.profiles
for select
using (public.current_user_role() = 'admin');

create policy "Admins can update profiles"
on public.profiles
for update
using (public.current_user_role() = 'admin');
```

### 5.2 Master Data Read Policies

Authenticated users can read active master data.

```
create policy "Authenticated users can read institutions"
on public.institutions
for select
using (auth.uid() is not null);

create policy "Authenticated users can read issuing banks"
on public.issuing_banks
for select
using (auth.uid() is not null);

create policy "Authenticated users can read quotes"
on public.quotes
for select
using (auth.uid() is not null);

create policy "Authenticated users can read quote issuing banks"
on public.quote_issuing_banks
for select
using (auth.uid() is not null);

create policy "Authenticated users can read quote charge rules"
on public.quote_charge_rules
for select
using (auth.uid() is not null);

create policy "Authenticated users can read reference rates"
on public.reference_rates
for select
using (auth.uid() is not null);

create policy "Authenticated users can read issuing bank fee rules"
on public.issuing_bank_fee_rules
for select
using (auth.uid() is not null);
```

### 5.3 Master Data Write Policies

Admins and editors can insert/update.

Only admins can delete.

```
create policy "Admins and editors can insert institutions"
on public.institutions
for insert
with check (public.current_user_role() in ('admin', 'editor'));

create policy "Admins and editors can update institutions"
on public.institutions
for update
using (public.current_user_role() in ('admin', 'editor'));

create policy "Admins can delete institutions"
on public.institutions
for delete
using (public.current_user_role() = 'admin');
```

Repeat same pattern for:

```
issuing_banks
quotes
quote_issuing_banks
quote_charge_rules
reference_rates
issuing_bank_fee_rules
```

### 5.4 Calculation Run Policies

Users can create and read own calculation runs.

Admins can read all.

```
create policy "Users can insert own calculation runs"
on public.calculation_runs
for insert
with check (user_id = auth.uid());

create policy "Users can read own calculation runs"
on public.calculation_runs
for select
using (user_id = auth.uid());

create policy "Admins can read all calculation runs"
on public.calculation_runs
for select
using (public.current_user_role() = 'admin');
```

For result tables, access via parent calculation run.

```
create policy "Users can read own calculation results"
on public.calculation_results
for select
using (
  exists (
    select 1
    from public.calculation_runs cr
    where cr.id = calculation_results.calculation_run_id
    and cr.user_id = auth.uid()
  )
);

create policy "Admins can read all calculation results"
on public.calculation_results
for select
using (public.current_user_role() = 'admin');
```

Same pattern for `calculation_result_lines`.

For inserts into results, use server route with user session. The server can insert rows after creating calculation run.

## 6. TypeScript Types

### 6.1 Calculation Input

```
export type CalculateInput = {
  issuingBankId: string;
  currency: string;
  transactionAmount: number;
  lcMaturityDays: number;
  shipmentDays: number;
  paymentTermsDays: number;
  selectedQuoteIds?: string[];
};
```

### 6.2 Anchor Days

```
export type AnchorDays = {
  LC_ISSUE_DAY: number;
  SHIPMENT_DAY: number;
  SUPPLIER_PAYMENT_DAY: number;
  FINAL_MATURITY_DAY: number;
};
```

### 6.3 Charge Rule

```
export type ChargeRule = {
  id: string;
  quoteId?: string;
  issuingBankFeeRuleId?: string;

  chargeType: ChargeType;
  payer: PayerType;

  rateType: RateType;
  fixedRatePct?: number | null;
  baseRateKey?: string | null;
  spreadPct?: number | null;
  fixedAmount?: number | null;

  amountBasis: 'transaction_amount';
  dayCountBasis: 360 | 365;

  startAnchor?: AnchorType | null;
  startOffsetDays: number;
  endAnchor?: AnchorType | null;
  endOffsetDays: number;

  minFeeAmount?: number | null;
  minFeeFrequency: 'none' | 'transaction' | 'month';

  displayOrder: number;
};
```

### 6.4 Charge Result Line

```
export type ChargeResultLine = {
  sourceType: 'quote_charge_rule' | 'issuing_bank_fee_rule';
  sourceRuleId: string;

  chargeType: ChargeType;
  payer: PayerType;

  startAnchor?: AnchorType | null;
  endAnchor?: Anchorusing (auth.uid() is not null);

create policy "Authenticated users can read reference rates"
on public.reference_rates
for select
using (authType | null;
  startDay?: number | null;
  endDay?: number | null;
  chargeDays?: number | null;

  amount: number;

  rateType: RateType;
  fixedRatePct?: number | null;
  baseRateKey?: string | null;
  baseRatePct?: number | null;
  spreadPct?: number | null;
  effectiveRatePct?: number | null;
  fixedAmount?: number | null;

  dayCountBasis?: 360 | 365 | null;

  calculatedFee: number;
  finalFee: number;

  formulaText: string;
  excelFormulaTemplate: string;

  displayOrder: number;
};
```

### 6.5 Quote Result

```
export type QuoteCalculationResult = {
  quoteId: string;
  institutionId: string;
  institutionName: string;
  quoteName: string;
  financingType: FinancingType;

  eligible: boolean;
  ineligibilityReason?: string;

  externalQuoteCost: number;
  issuingBankCost: number;
  totalCost: number;
  allInPct: number;

  lines: ChargeResultLine[];
};
```

## 7. Calculation Engine Implementation

### 7.1 resolveAnchorDays

```
export function resolveAnchorDays(input: CalculateInput): AnchorDays {
  return {
    LC_ISSUE_DAY: 0,
    SHIPMENT_DAY: input.shipmentDays,
    SUPPLIER_PAYMENT_DAY: input.shipmentDays + input.paymentTermsDays,
    FINAL_MATURITY_DAY: input.shipmentDays + input.lcMaturityDays,
  };
}
```

Validation:

```
transactionAmount > 0
shipmentDays >= 0
paymentTermsDays >= 0
lcMaturityDays > 0
FINAL_MATURITY_DAY >= SUPPLIER_PAYMENT_DAY
```

If supplier payment day is after final maturity day, reject input.

### 7.2 resolveRate

```
export function resolveRate(rule, referenceRates, currency): {
  baseRatePct: number | null;
  effectiveRatePct: number | null;
} {
  if (rule.rateType === 'base_plus_spread') {
    const base = findLatestActiveReferenceRate(rule.baseRateKey, currency);
    const effective = base.ratePct + rule.spreadPct;
    return {
      baseRatePct: base.ratePct,
      effectiveRatePct: effective,
    };
  }

  if (rule.rateType === 'annual_pct' || rule.rateType === 'flat_pct') {
    return {
      baseRatePct: null,
      effectiveRatePct: rule.fixedRatePct,
    };
  }

  return {
    baseRatePct: null,
    effectiveRatePct: null,
  };
}
```

### 7.3 calculateChargeRule

Pseudo-code:

```
export function calculateChargeRule({
  rule,
  input,
  anchorDays,
  referenceRates,
}: Params): ChargeResultLine {
  const amount = input.transactionAmount;

  let startDay: number | null = null;
  let endDay: number | null = null;
  let chargeDays: number | null = null;

  if (rule.startAnchor && rule.endAnchor) {
    startDay = anchorDays[rule.startAnchor] + rule.startOffsetDays;
    endDay = anchorDays[rule.endAnchor] + rule.endOffsetDays;
    chargeDays = endDay - startDay;

    if (chargeDays < 0) {
      throw new Error('Charge rule has negative charge days');
    }
  }

  let calculatedFee = 0;
  let baseRatePct = null;
  let effectiveRatePct = null;

  switch (rule.rateType) {
    case 'flat_pct':
      effectiveRatePct = rule.fixedRatePct;
      calculatedFee = amount * effectiveRatePct / 100;
      break;

    case 'annual_pct':
      effectiveRatePct = rule.fixedRatePct;
      calculatedFee = amount * effectiveRatePct / 100 * chargeDays / rule.dayCountBasis;
      break;

    case 'base_plus_spread':
      baseRatePct = resolveBaseRate(rule.baseRateKey, input.currency);
      effectiveRatePct = baseRatePct + rule.spreadPct;
      calculatedFee = amount * effectiveRatePct / 100 * chargeDays / rule.dayCountBasis;
      break;

    case 'fixed_amount':
      calculatedFee = rule.fixedAmount;
      break;
  }

  let finalFee = calculatedFee;

  if (rule.minFeeFrequency === 'transaction' && rule.minFeeAmount != null) {
    finalFee = Math.max(calculatedFee, rule.minFeeAmount);
  }

  if (rule.minFeeFrequency === 'month' && rule.minFeeAmount != null) {
    const months = Math.ceil((chargeDays ?? 0) / 30);
    finalFee = Math.max(calculatedFee, rule.minFeeAmount * months);
  }

  return {
    ...lineFields,
    calculatedFee,
    finalFee,
    formulaText,
    excelFormulaTemplate,
  };
}
```

### 7.4 Formula Text

Generate human-readable formula text.

Examples:

```
1,000,000 × 0.80% × 360 / 360
1,000,000 × (COF 4.20% + 0.20%) × 255 / 360
max(1,000,000 × 0.80% × 30 / 360, 1,000 × ceil(30 / 30))
```

### 7.5 Excel Formula Template

For each line, generate Excel formula referencing columns.

Example for annual percentage:

```
=AmountCell*RateCell/100*DaysCell/DayCountCell
```

Example for base plus spread:

```
=AmountCell*(BaseRateCell+SpreadCell)/100*DaysCell/DayCountCell
```

Example with monthly minimum:

```
=MAX(AmountCell*RateCell/100*DaysCell/DayCountCell, MinFeeCell*ROUNDUP(DaysCell/30,0))
```

Use actual Excel cell references during export.

## 8. API Contracts

### 8.1 POST `/api/calculate`

Request:

```
{
  "issuingBankId": "uuid",
  "currency": "USD",
  "transactionAmount": 1000000,
  "lcMaturityDays": 360,
  "shipmentDays": 30,
  "paymentTermsDays": 105,
  "selectedQuoteIds": []
}
```

Response:

```
{
  "runId": "uuid",
  "assumptions": {
    "LC_ISSUE_DAY": 0,
    "SHIPMENT_DAY": 30,
    "SUPPLIER_PAYMENT_DAY": 135,
    "FINAL_MATURITY_DAY": 390
  },
  "summary": [
    {
      "quoteId": "uuid",
      "institutionName": "Natixis",
      "quoteName": "Natixis USD Discounting",
      "financingType": "discounting",
      "eligible": true,
      "externalQuoteCost": 28000,
      "issuingBankCost": 20000,
      "totalCost": 48000,
      "allInPct": 4.8
    }
  ],
  "breakdown": [
    {
      "quoteId": "uuid",
      "institutionName": "Natixis",
      "chargeType": "discounting",
      "startAnchor": "SUPPLIER_PAYMENT_DAY",
      "endAnchor": "FINAL_MATURITY_DAY",
      "startDay": 135,
      "endDay": 390,
      "chargeDays": 255,
      "amount": 1000000,
      "rateType": "base_plus_spread",
      "baseRateKey": "COF",
      "baseRatePct": 4.2,
      "spreadPct": 0.2,
      "effectiveRatePct": 4.4,
      "finalFee": 31166.67,
      "formulaText": "1,000,000 × (COF 4.20% + 0.20%) × 255 / 360"
    }
  ]
}
```

### 8.2 POST `/api/export-excel`

Request:

```
{
  "runId": "uuid"
}
```

Response:

```
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

Filename:

```
lc-all-in-cost-comparison-{YYYYMMDD-HHmm}.xlsx
```

## 9. Excel Export Requirements

Use ExcelJS.

Workbook sheets:

```
1. Summary
2. Breakdown
3. Assumptions
4. Quote Rules
5. Reference Rates
6. Issuing Bank Fees
```

###.uid() is not null);

create policy "Authenticated users can read issuing bank fee rules"  
on public.issuing_bank_fee_rules  
for select  
using (auth.uid() is not null);

````

### 5.3 Master Data Write Policies

Admins and editors can insert/update.

Only admins can delete.

```sql
create policy "Admins and editors can insert institutions"
on public.institutions
for insert
with check (public.current_user_role() in ('admin', 'editor'));

create policy "Admins and editors can update institutions"
on public.institutions
for update
using (public.current_user_role() in ('admin', 'editor'));

create policy "Admins can delete institutions"
on public.institutions
for delete
using (public.current_user_role() = 'admin');
````

Repeat same pattern for:

```
issuing_banks
quotes
quote_issuing_banks
quote_charge_rules
reference_rates
issuing_bank_fee_rules
```

### 5.4 Calculation Run Policies

Users can create and read own calculation runs.

Admins can read all.

```
create policy "Users can insert own calculation runs"
on public.calculation_runs
for insert
with check (user_id = auth.uid());

create policy "Users can read own calculation runs"
on public.calculation_runs
for select
using (user_id = auth.uid());

create policy "Admins can read all calculation runs"
on public.calculation_runs
for select
using (public.current_user_role() = 'admin');
```

For result tables, access via parent calculation run.

```
create policy "Users can read own calculation results"
on public.calculation_results
for select
using (
  exists (
    select 1
    from public.calculation_runs cr
    where cr.id = calculation_results.calculation_run_id
    and cr.user_id = auth.uid()
  )
);

create policy "Admins can read all calculation results"
on public.calculation_results
for select
using (public.current_user_role() = 'admin');
```

Same pattern for `calculation_result_lines`.

For inserts into results, use server route with user session. The server can insert rows after creating calculation run.

## 6. TypeScript Types

### 6.1 Calculation Input

```
export type CalculateInput = {
  issuingBankId: string;
  currency: string;
  transactionAmount: number;
  lcMaturityDays: number;
  shipmentDays: number;
  paymentTermsDays: number;
  selectedQuoteIds?: string[];
};
```

### 6.2 Anchor Days

```
export type AnchorDays = {
  LC_ISSUE_DAY: number;
  SHIPMENT_DAY: number;
  SUPPLIER_PAYMENT_DAY: number;
  FINAL_MATURITY_DAY: number;
};
```

### 6.3 Charge Rule

```
export type ChargeRule = {
  id: string;
  quoteId?: string;
  issuingBankFeeRuleId?: string;

  chargeType: ChargeType;
  payer: PayerType;

  rateType: RateType;
  fixedRatePct?: number | null;
  baseRateKey?: string | null;
  spreadPct?: number | null;
  fixedAmount?: number | null;

  amountBasis: 'transaction_amount';
  dayCountBasis: 360 | 365;

  startAnchor?: AnchorType | null;
  startOffsetDays: number;
  endAnchor?: AnchorType | null;
  endOffsetDays: number;

  minFeeAmount?: number | null;
  minFeeFrequency: 'none' | 'transaction' | 'month';

  displayOrder: number;
};
```

### 6.4 Charge Result Line

```
export type ChargeResultLine = {
  sourceType: 'quote_charge_rule' | 'issuing_bank_fee_rule';
  sourceRuleId: string;

  chargeType: ChargeType;
  payer: PayerType;

  startAnchor?: AnchorType | null;
  endAnchor?: AnchorType | null;
  startDay?: number | null;
  endDay?: number | null;
  chargeDays?: number | null;

  amount: number;

  rateType: RateType;
  fixedRatePct?: number | null;
  baseRateKey?: string | null;
  baseRatePct?: number | null;
  spreadPct?: number | null;
  effectiveRatePct?: number | null;
  fixedAmount?: number | null;

  dayCountBasis?: 360 | 365 | null;

  calculatedFee: number;
  finalFee: number;

  formulaText: string;
  excelFormulaTemplate: string;

  displayOrder: number;
};
```

### 6.5 Quote Result

```
export type QuoteCalculationResult = {
  quoteId: string;
  institutionId: string;
  institutionName: string;
  quoteName: string;
  financingType: FinancingType;

  eligible: boolean;
  ineligibilityReason?: string;

  externalQuoteCost: number;
  issuingBankCost: number;
  totalCost: number;
  allInPct: number;

  lines: ChargeResultLine[];
};
```

## 7. Calculation Engine Implementation

### 7.1 resolveAnchorDays

```
export function resolveAnchorDays(input: CalculateInput): AnchorDays {
  return {
    LC_ISSUE_DAY: 0,
    SHIPMENT_DAY: input.shipmentDays,
    SUPPLIER_PAYMENT_DAY: input.shipmentDays + input.paymentTermsDays,
    FINAL_MATURITY_DAY: input.shipmentDays + input.lcMaturityDays,
  };
}
```

Validation:

```
transactionAmount > 0
shipmentDays >= 0
paymentTermsDays >= 0
lcMaturityDays > 0
FINAL_MATURITY_DAY >= SUPPLIER_PAYMENT_DAY
```

If supplier payment day is after final maturity day, reject input.

### 7.2 resolveRate

```
export function resolveRate(rule, referenceRates, currency): {
  baseRatePct: number | null;
  effectiveRatePct: number | null;
} {
  if (rule.rateType === 'base_plus_spread') {
    const base = findLatestActiveReferenceRate(rule.baseRateKey, currency);
    const effective = base.ratePct + rule.spreadPct;
    return {
      baseRatePct: base.ratePct,
      effectiveRatePct: effective,
    };
  }

  if (rule.rateType === 'annual_pct' || rule.rateType === 'flat_pct') {
    return {
      baseRatePct: null,
      effectiveRatePct: rule.fixedRatePct,
    };
  }

  return {
    baseRatePct: null,
    effectiveRatePct: null,
  };
}
```

### 7.3 calculateChargeRule

Pseudo-code:

```
export function calculateChargeRule({
  rule,
  input,
  anchorDays,
  referenceRates,
}: Params): ChargeResultLine {
  const amount = input.transactionAmount;

  let startDay: number | null = null;
  let endDay: number | null = null;
  let chargeDays: number | null = null;

  if (rule.startAnchor && rule.endAnchor) {
    startDay = anchorDays[rule.startAnchor] + rule.startOffsetDays;
    endDay = anchorDays[rule.endAnchor] + rule.endOffsetDays;
    chargeDays = endDay - startDay;

    if (chargeDays < 0) {
      throw new Error('Charge rule has negative charge days');
    }
  }

  let calculatedFee = 0;
  let baseRatePct = null;
  let effectiveRatePct = null;

  switch (rule.rateType) {
    case 'flat_pct':
      effectiveRatePct = rule.fixedRatePct;
      calculatedFee = amount * effectiveRatePct / 100;
      break;

    case 'annual_pct':
      effectiveRatePct = rule.fixedRatePct;
      calculatedFee = amount * effectiveRatePct / 100 * chargeDays / rule.dayCountBasis;
      break;

    case 'base_plus_spread':
      baseRatePct = resolveBaseRate(rule.baseRateKey, input.currency);
      effectiveRatePct = baseRatePct + rule.spreadPct;
      calculatedFee = amount * effectiveRatePct / 100 * chargeDays / rule.dayCountBasis;
      break;

    case 'fixed_amount':
      calculatedFee = rule.fixedAmount;
      break;
  }

  let finalFee = calculatedFee;

  if (rule.minFeeFrequency === 'transaction' && rule.minFeeAmount != null) {
    finalFee = Math.max(calculatedFee, rule.minFeeAmount);
  }

  if (rule.minFeeFrequency === 'month' && rule.minFeeAmount != null) {
    const months = Math.ceil((chargeDays ?? 0) / 30);
    finalFee = Math.max(calculatedFee, rule.minFeeAmount * months);
  }

  return {
    ...lineFields,
    calculatedFee,
    finalFee,
    formulaText,
    excelFormulaTemplate,
  };
}
```

### 7.4 Formula Text

Generate human-readable formula text.

Examples:

```
1,000,000 × 0.80% × 360 / 360
1,000,000 × (COF 4.20% + 0.20%) × 255 / 360
max(1,000,000 × 0.80% × 30 / 360, 1,000 × ceil(30 / 30))
```

### 7.5 Excel Formula Template

For each line, generate Excel formula referencing columns.

Example for annual percentage:

```
=AmountCell*RateCell/100*DaysCell/DayCountCell
```

Example for base plus spread:

```
=AmountCell*(BaseRateCell+SpreadCell)/100*DaysCell/DayCountCell
```

Example with monthly minimum:

```
=MAX(AmountCell*RateCell/100*DaysCell/DayCountCell, MinFeeCell*ROUNDUP(DaysCell/30,0))
```

Use actual Excel cell references during export.

## 8. API Contracts

### 8.1 POST `/api/calculate`

Request:

```
{
  "issuingBankId": "uuid",
  "currency": "USD",
  "transactionAmount": 1000000,
  "lcMaturityDays": 360,
  "shipmentDays": 30,
  "paymentTermsDays": 105,
  "selectedQuoteIds": []
}
```

Response:

```
{
  "runId": "uuid",
  "assumptions": {
    "LC_ISSUE_DAY": 0,
    "SHIPMENT_DAY": 30,
    "SUPPLIER_PAYMENT_DAY": 135,
    "FINAL_MATURITY_DAY": 390
  },
  "summary": [
    {
      "quoteId": "uuid",
      "institutionName": "Natixis",
      "quoteName": "Natixis USD Discounting",
      "financingType": "discounting",
      "eligible": true,
      "externalQuoteCost": 28000,
      "issuingBankCost": 20000,
      "totalCost": 48000,
      "allInPct": 4.8
    }
  ],
  "breakdown": [
    {
      "quoteId": "uuid",
      "institutionName": "Natixis",
      "chargeType": "discounting",
      "startAnchor": "SUPPLIER_PAYMENT_DAY",
      "endAnchor": "FINAL_MATURITY_DAY",
      "startDay": 135,
      "endDay": 390,
      "chargeDays": 255,
      "amount": 1000000,
      "rateType": "base_plus_spread",
      "baseRateKey": "COF",
      "baseRatePct": 4.2,
      "spreadPct": 0.2,
      "effectiveRatePct": 4.4,
      "finalFee": 31166.67,
      "formulaText": "1,000,000 × (COF 4.20% + 0.20%) × 255 / 360"
    }
  ]
}
```

### 8.2 POST `/api/export-excel`

Request:

```
{
  "runId": "uuid"
}
```

Response:

```
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

Filename:

```
lc-all-in-cost-comparison-{YYYYMMDD-HHmm}.xlsx
```

## 9. Excel Export Requirements

Use ExcelJS.

Workbook sheets:

```
1. Summary
2. Breakdown
3. Assumptions
4. Quote Rules
5. Reference Rates
6. Issuing Bank Fees
```

### 9.1 Summary Sheet Columns

|   |   |
|---|---|
|Column|Description|
|Institution|9.1 Summary Sheet Columns|

|   |   |
|---|---|
|Column|Description|
|Institution|bank / trading house|
|Quote Name|quote name|
|Financing Type|discounting / forfaiting / etc.|
|Currency|USD|
|Transaction Amount|amount|
|External Quote Cost|sum of quote rules|
|Issuing Bank Cost|issuing fee cost|
|Total Cost|external + issuing|
|All-in %|total / amount|
|Eligible|yes/no|
|Notes|quote notes|

Summary formulas:

```
Total Cost = External Quote Cost + Issuing Bank Cost
All-in % = Total Cost / Transaction Amount
```

### 9.2 Breakdown Sheet Columns

|   |   |
|---|---|
|Column|Description|
|Institution|bank / trading house|
|Quote Name|quote name|
|Source Type|quote rule / issuing bank fee|
|Charge Type|confirmation / discounting / etc.|
|Payer|applicant / beneficiary|
|Start Anchor|anchor|
|End Anchor|anchor|
|Start Day|numeric|
|End Day|numeric|
|Charge Days|numeric|
|Amount|transaction amount|
|Rate Type|annual_pct etc.|
|Fixed Rate %|optional|
|Base Rate Key|optional|
|Base Rate %|optional|
|Spread %|optional|
|Effective Rate %|optional|
|Day Count Basis|360 / 365|
|Min Fee Amount|optional|
|Min Fee Frequency|optional|
|Calculated Fee|before minimum|
|Final Fee|after minimum|
|Formula Text|readable formula|
|Excel Formula|actual Excel formula|

The `Final Fee` column should contain Excel formulas where possible.

Do not only export hardcoded values.

Corporate finance users need clickable formulas or they start hearing phantom auditors.

### 9.3 Assumptions Sheet

|   |   |
|---|---|
|Field|Value|
|Issuing Bank|Ziraat Bank|
|Currency|USD|
|Transaction Amount|1000000|
|LC Maturity Days|360|
|Shipment Days|30|
|Payment Terms Days|105|
|LC Issue Day|0|
|Shipment Day|30|
|Supplier Payment Day|135|
|Final Maturity Day|390|

### 9.4 Quote Rules Sheet

Export all rules used in the calculation.

Include:

```
quote_id
institution
quote_name
charge_type
rate_type
fixed_rate_pct
base_rate_key
spread_pct
start_anchor
end_anchor
min_fee_amount
min_fee_frequency
active
notes
```

### 9.5 Reference Rates Sheet

Export rates used.

```
rate_key
currency
tenor_days
rate_pct
rate_date
source
```

### 9.6 Issuing Bank Fees Sheet

Export issuing bank fee rules used.

## 10. Pages

### 10.1 Login Page

Path:

```
/login
```

Features:

- email/password login
- logout
- redirect authenticated user to `/calculate`

### 10.2 Dashboard

Path:

```
/dashboard
```

Simple landing page with links:

```
Calculate
Quotes
Reference Rates
Issuing Bank Fees
```

### 10.3 Calculation Page

Path:

```
/calculate
```

Form fields:

```
issuing bank
currency
transaction amount
LC maturity days
shipment days
payment terms days
optional quote filter
```

After submit:

- call `/api/calculate`
- show summary table
- allow row expand to breakdown
- show export Excel button

### 10.4 Quotes Page

Path:

```
/quotes
```

Admin/editor only.

Features:

- list quotes
- filter by institution, currency, financing type, active
- create quote
- edit quote
- deactivate quote
- manage eligible issuing banks
- manage charge rules

Quote form sections:

```
Basic Info
Eligibility
Charge Rules
Notes
```

### 10.5 Reference Rates Page

Path:

```
/reference-rates
```

Admin/editor only.

Features:

- list reference rates
- add new rate
- deactivate old rate
- filter by currency / rate key

### 10.6 Issuing Bank Fees Page

Path:

```
/issuing-bank-fees
```

Admin/editor only.

Features:

- list fee rules
- create/edit issuing bank fee
- support flat % / annual % / base + spread / fixed amount

## 11. Validation Rules

Use Zod.

### 11.1 Calculation Input Validation

```
transactionAmount > 0
lcMaturityDays > 0
shipmentDays >= 0
paymentTermsDays >= 0
shipmentDays + paymentTermsDays <= shipmentDays + lcMaturityDays
currency must be non-empty
issuingBankId must be UUID
```

### 11.2 Quote Validation

```
quote_name required
institution_id required
currency required
financing_type required
if financing_type = discounting, requires_confirmation must be true
if financing_type = forfaiting, requires_confirmation must be false
if applies_to_all_issuing_banks = false, at least one quote_issuing_banks row required
```

### 11.3 Charge Rule Validation

```
flat_pct requires fixed_rate_pct
annual_pct requires fixed_rate_pct, start_anchor, end_anchor
base_plus_spread requires base_rate_key, spread_pct, start_anchor, end_anchor
fixed_amount requires fixed_amount
day_count_basis must be 360 or 365
min_fee_frequency = none means min_fee_amount should be null
```

## 12. Seed Data

Create seed data for testing.

### 12.1 Institutions

```
Natixis - bank
QNB - bank
Habib Bank - bank
China Trade Solutions - trading_house
```

### 12.2 Issuing Banks

```
Ziraat Bank
Halkbank
VakıfBank
Garanti BBVA
İşbank
```

### 12.3 Reference Rates

```
COF / USD / 4.20
TERM_SOFR / USD / 4.50
TERM_SHIBOR / RMB / 2.30
```

### 12.4 Sample Quote 1: Discounting with Confirmation

```
Institution: Natixis
Currency: USD
Financing Type: discounting
Requires Confirmation: true
Applies to All Issuing Banks: false
Eligible Issuing Banks: Ziraat Bank, VakıfBank
```

Rules:

```
confirmation:
annual_pct 0.80
LC_ISSUE_DAY to SHIPMENT_DAY

deferred:
annual_pct 0.80
SHIPMENT_DAY to FINAL_MATURITY_DAY

discounting:
base_plus_spread COF + 0.20
SUPPLIER_PAYMENT_DAY to FINAL_MATURITY_DAY
```

### 12.5 Sample Quote 2: Whole-Period Confirmation

```
Institution: QNB
Currency: USD
Financing Type: mixed
Requires Confirmation: true
Applies to All Issuing Banks: false
Eligible Issuing Banks: Ziraat Bank, VakıfBank, Garanti BBVA, İşbank
```

Rules:

```
confirmation:
annual_pct 1.20
LC_ISSUE_DAY to FINAL_MATURITY_DAY
```

### 12.6 Sample Quote 3: Forfaiting

```
Institution: China Trade Solutions
Currency: USD
Financing Type: forfaiting
Requires Confirmation: false
Applies to All Issuing Banks: true
```

Rules:

```
forfaiting:
annual_pct 4.00
SHIPMENT_DAY to FINAL_MATURITY_DAY
```

### 12.7 Issuing Bank Fee

```
Issuing Bank: Ziraat Bank
Currency: USD
Fee Name: Opening Fee
Rate Type: flat_pct
Fixed Rate %: 2.00
```

## 13. Tests

Use Vitest.

### 13.1 Unit Tests

Test anchor resolution:

```
shipment_days = 30
payment_terms_days = 105
lc_maturity_days = 360

expect:
LC_ISSUE_DAY = 0
SHIPMENT_DAY = 30
SUPPLIER_PAYMENT_DAY = 135
FINAL_MATURITY_DAY = 390
```

Test annual percentage fee:

```
amount = 1,000,000
rate = 0.80%
days = 360
basis = 360

fee = 8,000
```

Test base plus spread:

```
amount = 1,000,000
base = 4.20%
spread = 0.20%
days = 255
basis = 360

fee = 31,166.6667
```

Test flat percentage:

```
amount = 1,000,000
flat = 2.00%

fee = 20,000
```

Test monthly minimum:

```
calculated_fee = 500
min_fee_amount = 1000
days = 45
ceil(45/30) = 2
final_fee = 2000
```

Test quote eligibility:

```
quote applies_to_all_issuing_banks = true
any issuing bank passes

quote applies_to_all_issuing_banks = false
only listed issuing banks pass
```

Test invalid timeline:

```
payment_terms_days > lc_maturity_days
should reject input
```

### 13.2 Integration Tests

Test `/api/calculate`:

```
input valid scenario
returns summary
returns breakdown
stores calculation run
stores result lines
```

Test `/api/export-excel`:

```
input runId
returns XLSX
workbook includes required sheets
summary sheet has formula cells
breakdown sheet has formula cells
```

## 14. Security Notes

Never expose Supabase service role key in browser.

Use:

```
Browser:
- anon / publishable key only

Server:
- service role key only if required
- prefer user session + RLS where possible
```

RLS must be enabled before real users use the app.

Do not rely only on frontend hiding buttons.

That is not security; that is theatre with CSS.

## 15. Deployment

Recommended MVP deployment:

```
Vercel + Supabase
```

Environment variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
```

Use service role key only in server-side files.

Never import admin Supabase client into client components.

Deployment steps:

```
1. Create Supabase project
2. Run migrations
3. Seed test data
4. Create first admin user
5. Deploy Next.js app
6. Add environment variables
7. Test login
8. Test calculation
9. Test Excel export
```

## 16. Implementation Order for Codex

Implement in this exact order:

```
1. Initialize Next.js TypeScript project.
2. Add Supabase client setup.
3. Add database migrations.
4. Add seed data.
5. Implement TypeScript calculation types.
6. Implement anchor resolution.
7. Implement reference rate resolution.
8. Implement charge rule calculation.
9. Implement quote eligibility.
10. Implement scenario calculation.
11. Add unit tests.
12. Add /api/calculate.
13. Add calculation run persistence.
14. Add Excel export builder.
15. Add /api/export-excel.
16. Add auth pages.
17. Add calculation UI.
18. Add quote admin UI.
19. Add reference rate admin UI.
20. Add issuing bank fee admin UI.
21. Add role-based route protection.
22. Polish UI.
```

Do not implement Figma styling until calculation engine and tests are working.

Do not modify calculation logic during UI polish unless tests are updated first.

## 17. MVP Exclusions

Do not build these in MVP:

```
document presentation date
taking up documents date
acceptance date
actual calendar date inputs
automatic SOFR/SHIBOR fetching
multi-company tenancy
audit logs
file attachments
approval workflow
email notifications
PDF export
complex quote versioning
```

These can be added later after the core engine works.

## 18. Definition of Done

The MVP is done when:

```
- user can log in
- admin/editor can create institutions
- admin/editor can create issuing banks
- admin/editor can create reference rates
- admin/editor can create quote headers
- admin/editor can create quote charge rules
- admin/editor can create issuing bank fee rules
- viewer can run calculation
- app filters eligible quotes correctly
- app calculates charge lines correctly
- app shows summary comparison
- app shows detailed breakdown
- app exports Excel with formulas
- calculation engine has passing unit tests
- RLS prevents unauthorized writes
```

That’s the spec I’d give Codex. The bank / trading house |  
| Quote Name | quote name |  
| Financing Type | discounting / forfaiting / etc. |  
| Currency | USD |  
| Transaction Amount | amount |  
| External Quote Cost | sum of quote rules |  
| Issuing Bank Cost | issuing fee cost |  
| Total Cost | external + issuing |  
| All-in % | total / amount |  
| Eligible | yes/no |  
| Notes | quote notes |

Summary formulas:

```
Total Cost = External Quote Cost + Issuing Bank Cost
All-in % = Total Cost / Transaction Amount
```

### 9.2 Breakdown Sheet Columns

|Column|Description|
|---|---|
|Institution|bank / trading house|
|Quote Name|quote name|
|Source Type|quote rule / issuing bank fee|
|Charge Type|confirmation / discounting / etc.|
|Payer|applicant / beneficiary|
|Start Anchor|anchor|
|End Anchor|anchor|
|Start Day|numeric|
|End Day|numeric|
|Charge Days|numeric|
|Amount|transaction amount|
|Rate Type|annual_pct etc.|
|Fixed Rate %|optional|
|Base Rate Key|optional|
|Base Rate %|optional|
|Spread %|optional|
|Effective Rate %|optional|
|Day Count Basis|360 / 365|
|Min Fee Amount|optional|
|Min Fee Frequency|optional|
|Calculated Fee|before minimum|
|Final Fee|after minimum|
|Formula Text|readable formula|
|Excel Formula|actual Excel formula|

The `Final Fee` column should contain Excel formulas where possible.

Do not only export hardcoded values.

Corporate finance users need clickable formulas or they start hearing phantom auditors.

### 9.3 Assumptions Sheet

|Field|Value|
|---|---|
|Issuing Bank|Ziraat Bank|
|Currency|USD|
|Transaction Amount|1000000|
|LC Maturity Days|360|
|Shipment Days|30|
|Payment Terms Days|105|
|LC Issue Day|0|
|Shipment Day|30|
|Supplier Payment Day|135|
|Final Maturity Day|390|

### 9.4 Quote Rules Sheet

Export all rules used in the calculation.

Include:

```
quote_id
institution
quote_name
charge_type
rate_type
fixed_rate_pct
base_rate_key
spread_pct
start_anchor
end_anchor
min_fee_amount
min_fee_frequency
active
notes
```

### 9.5 Reference Rates Sheet

Export rates used.

```
rate_key
currency
tenor_days
rate_pct
rate_date
source
```

### 9.6 Issuing Bank Fees Sheet

Export issuing bank fee rules used.

## 10. Pages

### 10.1 Login Page

Path:

```
/login
```

Features:

- email/password login
- logout
- redirect authenticated user to `/calculate`

### 10.2 Dashboard

Path:

```
/dashboard
```

Simple landing page with links:

```
Calculate
Quotes
Reference Rates
Issuing Bank Fees
```

### 10.3 Calculation Page

Path:

```
/calculate
```

Form fields:

```
issuing bank
currency
transaction amount
LC maturity days
shipment days
payment terms days
optional quote filter
```

After submit:

- call `/api/calculate`
- show summary table
- allow row expand to breakdown
- show export Excel button

### 10.4 Quotes Page

Path:

```
/quotes
```

Admin/editor only.

Features:

- list quotes
- filter by institution, currency, financing type, active
- create quote
- edit quote
- deactivate quote
- manage eligible issuing banks
- manage charge rules

Quote form sections:

```
Basic Info
Eligibility
Charge Rules
Notes
```

### 10.5 Reference Rates Page

Path:

```
/reference-rates
```

Admin/editor only.

Features:

- list reference rates
- add new rate
- deactivate old rate
- filter by currency / rate key

### 10.6 Issuing Bank Fees Page

Path:

```
/issuing-bank-fees
```

Admin/editor only.

Features:

- list fee rules
- create/edit issuing bank fee
- support flat % / annual % / base + spread / fixed amount

## 11. Validation Rules

Use Zod.

### 11.1 Calculation Input Validation

```
transactionAmount > 0
lcMaturityDays > 0
shipmentDays >= 0
paymentTermsDays >= 0
shipmentDays + paymentTermsDays <= shipmentDays + lcMaturityDays
currency must be non-empty
issuingBankId must be UUID
```

### 11.2 Quote Validation

```
quote_name required
institution_id required
currency required
financing_type required
if financing_type = discounting, requires_confirmation must be true
if financing_type = forfaiting, requires_confirmation must be false
if applies_to_all_issuing_banks = false, at least one quote_issuing_banks row required
```

### 11.3 Charge Rule Validation

```
flat_pct requires fixed_rate_pct
annual_pct requires fixed_rate_pct, start_anchor, end_anchor
base_plus_spread requires base_rate_key, spread_pct, start_anchor, end_anchor
fixed_amount requires fixed_amount
day_count_basis must be 360 or 365
min_fee_frequency = none means min_fee_amount should be null
```

## 12. Seed Data

Create seed data for testing.

### 12.1 Institutions

```
Natixis - bank
QNB - bank
Habib Bank - bank
China Trade Solutions - trading_house
```

### 12.2 Issuing Banks

```
Ziraat Bank
Halkbank
VakıfBank
Garanti BBVA
İşbank
```

### 12.3 Reference Rates

```
COF / USD / 4.20
TERM_SOFR / USD / 4.50
TERM_SHIBOR / RMB / 2.30
```

### 12.4 Sample Quote 1: Discounting with Confirmation

```
Institution: Natixis
Currency: USD
Financing Type: discounting
Requires Confirmation: true
Applies to All Issuing Banks: false
Eligible Issuing Banks: Ziraat Bank, VakıfBank
```

Rules:

```
confirmation:
annual_pct 0.80
LC_ISSUE_DAY to SHIPMENT_DAY

deferred:
annual_pct 0.80
SHIPMENT_DAY to FINAL_MATURITY_DAY

discounting:
base_plus_spread COF + 0.20
SUPPLIER_PAYMENT_DAY to FINAL_MATURITY_DAY
```

### 12.5 Sample Quote 2: Whole-Period Confirmation

```
Institution: QNB
Currency: USD
Financing Type: mixed
Requires Confirmation: true
Applies to All Issuing Banks: false
Eligible Issuing Banks: Ziraat Bank, VakıfBank, Garanti BBVA, İşbank
```

Rules:

```
confirmation:
annual_pct 1.20
LC_ISSUE_DAY to FINAL_MATURITY_DAY
```

### 12.6 Sample Quote 3: Forfaiting

```
Institution: China Trade Solutions
Currency: USD
Financing Type: forfaiting
Requires Confirmation: false
Applies to All Issuing Banks: true
```

Rules:

```
forfaiting:
annual_pct 4.00
SHIPMENT_DAY to FINAL_MATURITY_DAY
```

### 12.7 Issuing Bank Fee

```
Issuing Bank: Ziraat Bank
Currency: USD
Fee Name: Opening Fee
Rate Type: flat_pct
Fixed Rate %: 2.00
```

## 13. Tests

Use Vitest.

### 13.1 Unit Tests

Test anchor resolution:

```
shipment_days = 30
payment_terms_days = 105
lc_maturity_days = 360

expect:
LC_ISSUE_DAY = 0
SHIPMENT_DAY = 30
SUPPLIER_PAYMENT_DAY = 135
FINAL_MATURITY_DAY = 390
```

Test annual percentage fee:

```
amount = 1,000,000
rate = 0.80%
days = 360
basis = 360

fee = 8,000
```

Test base plus spread:

```
amount = 1,000,000
base = 4.20%
spread = 0.20%
days = 255
basis = 360

fee = 31,166.6667
```

Test flat percentage:

```
amount = 1,000,000
flat = 2.00%

fee = 20,000
```

Test monthly minimum:

```
calculated_fee = 500
min_fee_amount = 1000
days = 45
ceil(45/30) = 2
final_fee = 2000
```

Test quote eligibility:

```
quote applies_to_all_issuing_banks = true
any issuing bank passes

quote applies_to_all_issuing_banks = false
only listed issuing banks pass
```

Test invalid timeline:

```
payment_terms_days > lc_maturity_days
should reject input
```

### 13.2 Integration Tests

Test `/api/calculate`:

```
input valid scenario
returns summary
returns breakdown
stores calculation run
stores result lines
```

Test `/api/export-excel`:

```
input runId
returns XLSX
workbook includes required sheets
summary sheet has formula cells
breakdown sheet has formula cells
```

## 14. Security Notes

Never expose Supabase service role key in browser.

Use:

```
Browser:
- anon / publishable key only

Server:
- service role key only if required
- prefer user session + RLS where possible
```

RLS must be enabled before real users use the app.

Do not rely only on frontend hiding buttons.

That is not security; that is theatre with CSS.

## 15. Deployment

Recommended MVP deployment:

```
Vercel + Supabase
```

Environment variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
```

Use service role key only in server-side files.

Never import admin Supabase client into client components.

Deployment steps:

```
1. Create Supabase project
2. Run migrations
3. Seed test data
4. Create first admin user
5. Deploy Next.js app
6. Add environment variables
7. Test login
8. Test calculation
9. Test Excel export
```

## 16. Implementation Order for Codex

Implement in this exact order:

```
1. Initialize Next.js TypeScript project.
2. Add Supabase client setup.
3. Add database migrations.
4. Add seed data.
5. Implement TypeScript calculation types.
6. Implement anchor resolution.
7. Implement reference rate resolution.
8. Implement charge rule calculation.
9. Implement quote eligibility.
10. Implement scenario calculation.
11. Add unit tests.
12. Add /api/calculate.
13. Add calculation run persistence.
14. Add Excel export builder.
15. Add /api/export-excel.
16. Add auth pages.
17. Add calculation UI.
18. Add quote admin UI.
19. Add reference rate admin UI.
20. Add issuing bank fee admin UI.
21. Add role-based route protection.
22. Polish UI.
```

Do not implement Figma styling until calculation engine and tests are working.

Do not modify calculation logic during UI polish unless tests are updated first.

## 17. MVP Exclusions

Do not build these in MVP:

```
document presentation date
taking up documents date
acceptance date
actual calendar date inputs
automatic SOFR/SHIBOR fetching
multi-company tenancy
audit logs
file attachments
approval workflow
email notifications
PDF export
complex quote versioning
```

These can be added later after the core engine works.

## 18. Definition of Done

The MVP is done when:

```
- user can log in
- admin/editor can create institutions
- admin/editor can create issuing banks
- admin/editor can create reference rates
- admin/editor can create quote headers
- admin/editor can create quote charge rules
- admin/editor can create issuing bank fee rules
- viewer can run calculation
- app filters eligible quotes correctly
- app calculates charge lines correctly
- app shows summary comparison
- app shows detailed breakdown
- app exports Excel with formulas
- calculation engine has passing unit tests
- RLS prevents unauthorized writes
```
