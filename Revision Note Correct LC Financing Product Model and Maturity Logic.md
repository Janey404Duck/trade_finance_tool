
## 1. Reason for Revision

The previous implementation incorrectly treated `discounting` and `forfaiting` as parallel financing products.

This is wrong for our business logic.

The corrected model is:

```text
Confirmation and forfaiting are the two parallel solution paths.

Discounting is an optional component under the confirmation path.
```

In practice:

```text
LC Financing
├── Confirmation path
│   ├── confirmation fee
│   ├── deferred payment fee, if quoted
│   └── optional discounting fee
│
└── Forfaiting path
    └── forfaiting fee
```

Therefore, the data model, input model, calculation engine, summary result, and Excel export must be refactored accordingly.

---

## 2. Corrected Business Logic

### 2.1 Solution Paths

The user should be able to select one or both of the following solution paths:

```text
CONFIRMATION
FORFAITING
```

If the user selects `CONFIRMATION`, the user should also be able to choose whether to include discounting.

If discounting is included, the user should specify the discounting start period.

Example:

```text
Confirmation selected: yes
Include discounting: yes
Discounting starts: 90 days after shipment
```

### 2.2 Discounting Is Not a Standalone Path

Remove any logic where `DISCOUNTING` is treated as a parallel top-level financing path.

Wrong:

```text
CONFIRMATION vs DISCOUNTING vs FORFAITING
```

Correct:

```text
CONFIRMATION vs FORFAITING

and under CONFIRMATION:
- with discounting
- without discounting
```

### 2.3 Forfaiting Remains Separate

Forfaiting should remain a separate solution path.

Forfaiting cost must be maintained and calculated separately from discounting cost.

This matters because the same bank may quote:

```text
confirmation fee
discounting spread
forfaiting rate
```

and these may all have different pricing.

---

## 3. Corrected Maturity Logic

The LC maturity date / maturity day is not always calculated from shipment date.

For MVP, support only the following two maturity basis options:

```text
AFTER_SHIPMENT
AFTER_LC_ISSUANCE
```

Do not implement the following in MVP:

```text
AFTER_INVOICE_DATE
AFTER_SIGHT
AFTER_ACCEPTANCE
```

These can be added later.

---

## 4. Revised User Inputs

Replace the old input model with this model:

```ts
type CalculateInput = {
  issuingBankId: string;
  currency: string;
  transactionAmount: number;

  shipmentDaysAfterLcIssue: number;

  maturityBasis: 'AFTER_SHIPMENT' | 'AFTER_LC_ISSUANCE';
  maturityDays: number;

  selectedPaths: Array<'CONFIRMATION' | 'FORFAITING'>;

  confirmationOptions?: {
    includeDiscounting: boolean;
    discountStartDaysAfterShipment?: number;
  };
};
```

### Field Meaning

|Field|Meaning|
|---|---|
|`shipmentDaysAfterLcIssue`|Number of days between LC issuance and shipment|
|`maturityBasis`|Whether LC maturity is counted from shipment date or LC issuance date|
|`maturityDays`|The maturity tenor written in the LC clause|
|`selectedPaths`|Whether user wants to calculate confirmation, forfaiting, or both|
|`includeDiscounting`|Only applies when `CONFIRMATION` is selected|
|`discountStartDaysAfterShipment`|Supplier early-payment date measured from shipment date|

---

## 5. Revised Timeline Anchors

Use only these anchors in MVP:

```ts
type AnchorType =
  | 'LC_ISSUE_DAY'
  | 'SHIPMENT_DAY'
  | 'DISCOUNT_START_DAY'
  | 'FINAL_MATURITY_DAY';
```

Resolve anchors as follows:

```ts
const LC_ISSUE_DAY = 0;

const SHIPMENT_DAY = input.shipmentDaysAfterLcIssue;

const FINAL_MATURITY_DAY =
  input.maturityBasis === 'AFTER_SHIPMENT'
    ? SHIPMENT_DAY + input.maturityDays
    : input.maturityDays;

const DISCOUNT_START_DAY =
  SHIPMENT_DAY + (input.confirmationOptions?.discountStartDaysAfterShipment ?? 0);
```

---

## 6. Critical Maturity Rule for Discounting and Forfaiting

The maturity end day used for discounting and forfaiting must always be based on the revised LC maturity logic.

That means both discounting and forfaiting must end at:

```text
FINAL_MATURITY_DAY
```

Do not assume maturity is always:

```text
SHIPMENT_DAY + 360
```

Instead, calculate maturity according to the LC maturity basis.

### Example 1: 360 Days After Shipment

Input:

```text
shipmentDaysAfterLcIssue = 30
maturityBasis = AFTER_SHIPMENT
maturityDays = 360
discountStartDaysAfterShipment = 90
```

Anchor calculation:

```text
LC_ISSUE_DAY = 0
SHIPMENT_DAY = 30
FINAL_MATURITY_DAY = 30 + 360 = 390
DISCOUNT_START_DAY = 30 + 90 = 120
```

Discounting period:

```text
DISCOUNT_START_DAY to FINAL_MATURITY_DAY
= 120 to 390
= 270 days
```

Forfaiting period, if configured from shipment:

```text
SHIPMENT_DAY to FINAL_MATURITY_DAY
= 30 to 390
= 360 days
```

### Example 2: 360 Days After LC Issuance

Input:

```text
shipmentDaysAfterLcIssue = 30
maturityBasis = AFTER_LC_ISSUANCE
maturityDays = 360
discountStartDaysAfterShipment = 90
```

Anchor calculation:

```text
LC_ISSUE_DAY = 0
SHIPMENT_DAY = 30
FINAL_MATURITY_DAY = 360
DISCOUNT_START_DAY = 30 + 90 = 120
```

Discounting period:

```text
DISCOUNT_START_DAY to FINAL_MATURITY_DAY
= 120 to 360
= 240 days
```

Forfaiting period, if configured from shipment:

```text
SHIPMENT_DAY to FINAL_MATURITY_DAY
= 30 to 360
= 330 days
```

This is the critical correction.

The maturity end point for discounting / forfaiting must follow the revised `FINAL_MATURITY_DAY`.

---

## 7. Revised Quote Data Model

Refactor quote maintenance into three levels:

```text
quote_packages
quote_components
quote_charge_rules
```

### 7.1 Quote Package

A quote package is the institution-level quotation header.

```sql
create table quote_packages (
  id uuid primary key default gen_random_uuid(),

  institution_id uuid not null references institutions(id),

  package_name text not null,
  currency text not null,

  applies_to_all_issuing_banks boolean not null default true,

  min_amount numeric(18,2),
  max_amount numeric(18,2),
  min_maturity_days integer,
  max_maturity_days integer,

  valid_from date,
  valid_to date,

  active boolean not null default true,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 7.2 Quote Package Eligible Issuing Banks

Only used when `applies_to_all_issuing_banks = false`.

```sql
create table quote_package_issuing_banks (
  id uuid primary key default gen_random_uuid(),

  quote_package_id uuid not null references quote_packages(id) on delete cascade,
  issuing_bank_id uuid not null references issuing_banks(id),

  unique (quote_package_id, issuing_bank_id)
);
```

Eligibility logic:

```text
If applies_to_all_issuing_banks = true:
    quote package is eligible for all issuing banks

If applies_to_all_issuing_banks = false:
    quote package is eligible only for issuing banks listed in quote_package_issuing_banks
```

If no issuing bank is mentioned in the quote, explicitly set:

```text
applies_to_all_issuing_banks = true
```

Do not represent this as null or missing data.

### 7.3 Quote Components

Each quote package may contain separate components.

```sql
create type quote_component_type as enum (
  'CONFIRMATION',
  'DEFERRED',
  'DISCOUNTING',
  'FORFAITING',
  'OTHER'
);

create table quote_components (
  id uuid primary key default gen_random_uuid(),

  quote_package_id uuid not null references quote_packages(id) on delete cascade,

  component_type quote_component_type not null,

  active boolean not null default true,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Examples:

```text
Natixis USD Quote Package
├── CONFIRMATION component
├── DEFERRED component
├── DISCOUNTING component
└── FORFAITING component
```

```text
China Trade Solutions Quote Package
└── FORFAITING component
```

```text
QNB USD Quote Package
├── CONFIRMATION component
└── DISCOUNTING component
```

### 7.4 Quote Charge Rules

Each charge rule belongs to a quote component.

```sql
create type charge_type as enum (
  'CONFIRMATION_FEE',
  'DEFERRED_PAYMENT_FEE',
  'DISCOUNTING_FEE',
  'FORFAITING_FEE',
  'HANDLING_FEE',
  'ISSUING_BANK_FEE',
  'OTHER'
);

create type anchor_type as enum (
  'LC_ISSUE_DAY',
  'SHIPMENT_DAY',
  'DISCOUNT_START_DAY',
  'FINAL_MATURITY_DAY'
);

create table quote_charge_rules (
  id uuid primary key default gen_random_uuid(),

  quote_component_id uuid not null references quote_components(id) on delete cascade,

  charge_type charge_type not null,
  payer payer_type not null default 'applicant',

  rate_type rate_type not null,

  fixed_rate_pct numeric(10,6),
  base_rate_key text,
  spread_pct numeric(10,6),
  fixed_amount numeric(18,2),

  amount_basis text not null default 'transaction_amount',
  day_count_basis integer not null default 360,

  start_anchor anchor_type,
  start_offset_days integer not null default 0,
  end_anchor anchor_type,
  end_offset_days integer not null default 0,

  min_fee_amount numeric(18,2),
  min_fee_frequency min_fee_frequency not null default 'none',

  display_order integer not null default 0,
  active boolean not null default true,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## 8. Component Inclusion Rules During Calculation

### 8.1 Confirmation Path

If user selects `CONFIRMATION`, include the following components from each eligible quote package:

```text
CONFIRMATION
DEFERRED, if active and available
DISCOUNTING, only if includeDiscounting = true
```

Also include applicable issuing bank fees.

### 8.2 Forfaiting Path

If user selects `FORFAITING`, include:

```text
FORFAITING
```

Also include applicable issuing bank fees, unless later business logic adds a toggle to exclude them.

### 8.3 If User Selects Both Paths

If user selects both:

```text
CONFIRMATION
FORFAITING
```

Return two separate result rows per quote package where applicable:

```text
Natixis - Confirmation Path
Natixis - Forfaiting Path
QNB - Confirmation Path
China Trade Solutions - Forfaiting Path
```

Do not combine confirmation and forfaiting costs into one result row.

---

## 9. Revised Summary Output

The summary result should be path-level.

Each row should represent one institution quote package under one selected solution path.

Example columns:

|Column|Meaning|
|---|---|
|Institution|Bank / trading house name|
|Quote Package|Quote package name|
|Solution Path|`CONFIRMATION` or `FORFAITING`|
|Includes Discounting|yes / no|
|Confirmation Cost|Sum of confirmation fee lines|
|Deferred Cost|Sum of deferred payment fee lines|
|Discounting Cost|Sum of discounting fee lines|
|Forfaiting Cost|Sum of forfaiting fee lines|
|Issuing Bank Cost|Sum of issuing bank fee lines|
|Total Cost|Total path cost|
|All-in %|Total cost / transaction amount|
|Eligible|yes / no|
|Notes|quote notes|

---

## 10. Revised Calculation Result Type

```ts
type CalculationPathResult = {
  quotePackageId: string;
  institutionId: string;
  institutionName: string;
  packageName: string;

  solutionPath: 'CONFIRMATION' | 'FORFAITING';

  includesDiscounting: boolean;

  confirmationCost: number;
  deferredCost: number;
  discountingCost: number;
  forfaitingCost: number;
  issuingBankCost: number;

  totalCost: number;
  allInPct: number;

  lines: ChargeResultLine[];
};
```

---

## 11. Revised API Request

```json
{
  "issuingBankId": "uuid",
  "currency": "USD",
  "transactionAmount": 1000000,

  "shipmentDaysAfterLcIssue": 30,

  "maturityBasis": "AFTER_SHIPMENT",
  "maturityDays": 360,

  "selectedPaths": ["CONFIRMATION", "FORFAITING"],

  "confirmationOptions": {
    "includeDiscounting": true,
    "discountStartDaysAfterShipment": 90
  }
}
```

Example for maturity after LC issuance:

```json
{
  "issuingBankId": "uuid",
  "currency": "USD",
  "transactionAmount": 1000000,

  "shipmentDaysAfterLcIssue": 30,

  "maturityBasis": "AFTER_LC_ISSUANCE",
  "maturityDays": 360,

  "selectedPaths": ["CONFIRMATION"],

  "confirmationOptions": {
    "includeDiscounting": true,
    "discountStartDaysAfterShipment": 90
  }
}
```

---

## 12. Revised Excel Export

Excel export must reflect path-level results.

Workbook sheets:

```text
Summary
Breakdown
Assumptions
Quote Packages
Quote Components
Quote Charge Rules
Reference Rates
Issuing Bank Fees
```

### Summary Sheet

Each row should be one path result.

Example:

|Institution|Quote Package|Solution Path|Includes Discounting|Confirmation Cost|Deferred Cost|Discounting Cost|Forfaiting Cost|Issuing Bank Cost|Total Cost|All-in %|
|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|

### Breakdown Sheet

Each row should be one charge rule calculation.

Important:

```text
Discounting and forfaiting must show their end anchor as FINAL_MATURITY_DAY.
FINAL_MATURITY_DAY must reflect maturityBasis.
```

Include formula columns for verification.

Formula examples:

```text
Discounting fee = amount × effective_rate_pct × (FINAL_MATURITY_DAY - DISCOUNT_START_DAY) / day_count_basis
Forfaiting fee = amount × effective_rate_pct × (FINAL_MATURITY_DAY - start_day) / day_count_basis
```

---

## 13. Migration Instruction from Previous Incorrect Spec

If the previous implementation already created:

```text
quotes
quote_charge_rules
```

with `financing_type = discounting / forfaiting / confirmation`, refactor as follows:

### 13.1 Rename or Replace Quote Header

Old:

```text
quotes
```

New:

```text
quote_packages
```

Each old quote should become a quote package.

### 13.2 Create Components

For each old quote:

If old `financing_type = confirmation`:

```text
create quote_component = CONFIRMATION
```

If the old quote had deferred rules:

```text
create quote_component = DEFERRED
```

If old `financing_type = discounting`:

```text
create quote_component = DISCOUNTING
```

But do not treat this as standalone path anymore.

It must only be included under the confirmation path when `includeDiscounting = true`.

If old `financing_type = forfaiting`:

```text
create quote_component = FORFAITING
```

### 13.3 Move Charge Rules

Old charge rules should be reassigned from quote-level to component-level.

Old:

```text
quote_charge_rules.quote_id
```

New:

```text
quote_charge_rules.quote_component_id
```

### 13.4 Refactor Calculation Engine

Remove logic that calculates one result per quote financing type.

Replace it with:

```text
For each eligible quote package:
    If CONFIRMATION selected:
        calculate confirmation path
    If FORFAITING selected:
        calculate forfaiting path
```

### 13.5 Refactor Discounting Logic

Discounting component should only be included when:

```text
selectedPaths includes CONFIRMATION
and confirmationOptions.includeDiscounting = true
and quote package has active DISCOUNTING component
```

### 13.6 Refactor Maturity Logic

Replace any hardcoded logic like:

```text
FINAL_MATURITY_DAY = SHIPMENT_DAY + maturityDays
```

with:

```ts
FINAL_MATURITY_DAY =
  input.maturityBasis === 'AFTER_SHIPMENT'
    ? SHIPMENT_DAY + input.maturityDays
    : input.maturityDays;
```

Then ensure all discounting and forfaiting rules end at the revised `FINAL_MATURITY_DAY`.

---

## 14. Tests to Add or Update

### Test 1: Maturity After Shipment

Input:

```text
shipmentDaysAfterLcIssue = 30
maturityBasis = AFTER_SHIPMENT
maturityDays = 360
discountStartDaysAfterShipment = 90
```

Expected:

```text
SHIPMENT_DAY = 30
FINAL_MATURITY_DAY = 390
DISCOUNT_START_DAY = 120
discounting days = 270
```

### Test 2: Maturity After LC Issuance

Input:

```text
shipmentDaysAfterLcIssue = 30
maturityBasis = AFTER_LC_ISSUANCE
maturityDays = 360
discountStartDaysAfterShipment = 90
```

Expected:

```text
SHIPMENT_DAY = 30
FINAL_MATURITY_DAY = 360
DISCOUNT_START_DAY = 120
discounting days = 240
```

### Test 3: Discounting Not Standalone

Input:

```text
selectedPaths = [FORFAITING]
includeDiscounting = true
```

Expected:

```text
No discounting component should be included.
Only forfaiting component should be calculated.
```

### Test 4: Confirmation With Discounting

Input:

```text
selectedPaths = [CONFIRMATION]
includeDiscounting = true
```

Expected:

```text
CONFIRMATION component included
DEFERRED component included if available
DISCOUNTING component included if available
FORFAITING component excluded
```

### Test 5: Confirmation Without Discounting

Input:

```text
selectedPaths = [CONFIRMATION]
includeDiscounting = false
```

Expected:

```text
CONFIRMATION component included
DEFERRED component included if available
DISCOUNTING component excluded
FORFAITING component excluded
```

### Test 6: Both Paths

Input:

```text
selectedPaths = [CONFIRMATION, FORFAITING]
includeDiscounting = true
```

Expected:

```text
Return separate confirmation path result
Return separate forfaiting path result
Do not combine costs into one row
```

---

## 15. MVP Exclusions Remain

Do not implement these yet:

```text
maturity after invoice date
maturity after sight
maturity after acceptance
actual calendar date input
document presentation date
acceptance date
taking-up-documents date
automatic market rate fetching
quote versioning
```

MVP should only support:

```text
AFTER_SHIPMENT
AFTER_LC_ISSUANCE
```

using day-based calculation.

---

## 16. Definition of Done for This Revision

This revision is complete when:

```text
- discounting is no longer a top-level solution path
- confirmation and forfaiting are parallel paths
- discounting is optional under confirmation path
- quote data is maintained as package → component → charge rules
- discounting and forfaiting costs are shown separately
- maturity basis supports AFTER_SHIPMENT and AFTER_LC_ISSUANCE
- discounting and forfaiting periods end at revised FINAL_MATURITY_DAY
- calculation summary is path-level
- Excel export is path-level
- tests cover both maturity basis options
- tests confirm discounting cannot run as standalone path
```