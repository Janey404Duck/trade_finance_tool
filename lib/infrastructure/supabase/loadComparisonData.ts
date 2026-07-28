import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompareScenarioDependencies } from '@/lib/application/compareScenario';
import type {
  BaseFeeRecord,
  FeeKind,
  Institution,
  InstitutionType,
  IssuingBankFeeRecord,
  IssuingBankQuotation,
  NonIssuingBankFeeRecord,
  NonIssuingBankQuotation,
  PricingRate,
} from '@/lib/domain/quotation/model';

type Row = Record<string, unknown>;

const commonFeeSelection = `
  id, fee_code, label, component_kind, disclosure_status, rate_type,
  fixed_amount, rate_pct, reference_rate_family, spread_pct,
  start_event_name, end_event_name, day_count_convention, billing_frequency,
  partial_period_rounding, minimum_period_days, minimum_fee_amount,
  include_start_date, include_end_date, display_order
`;

export async function loadComparisonData(
  supabase: SupabaseClient,
  asOfDate: string,
): Promise<CompareScenarioDependencies> {
  const [issuingResponse, nonIssuingResponse, rateResponse] = await Promise.all([
    supabase.from('issuing_bank_quotations').select(`
      id, reference, currency, tenor_days, min_amount, max_amount,
      institution:institutions!issuing_bank_quotations_institution_id_fkey(
        id, name, institution_type, active
      ),
      versions:issuing_bank_quotation_versions(
        id, version, status, valid_from, valid_to,
        pricing:issuing_bank_fee_records(${commonFeeSelection})
      )
    `),
    supabase.from('non_issuing_bank_quotations').select(`
      id, reference, currency, tenor_days, min_amount, max_amount,
      institution:institutions!non_issuing_bank_quotations_institution_id_fkey(
        id, name, institution_type, active
      ),
      versions:non_issuing_bank_quotation_versions(
        id, version, status, valid_from, valid_to,
        pricing:non_issuing_bank_fee_records(
          ${commonFeeSelection}, applicable_solutions
        )
      ),
      issuing_institutions:non_issuing_quotation_issuing_banks(institution_id)
    `),
    supabase
      .from('reference_rate_values')
      .select(`
        reference_rate_index_id, effective_date, rate_pct,
        index:reference_rate_indices!reference_rate_values_reference_rate_index_id_fkey(
          name, family, currency, tenor_months, active
        )
      `)
      .lte('effective_date', asOfDate)
      .order('effective_date', { ascending: false }),
  ]);

  if (issuingResponse.error) {
    throw new Error(`Unable to load issuing-bank quotations: ${issuingResponse.error.message}`);
  }
  if (nonIssuingResponse.error) {
    throw new Error(`Unable to load non-issuing quotations: ${nonIssuingResponse.error.message}`);
  }
  if (rateResponse.error) {
    throw new Error(`Unable to load reference rates: ${rateResponse.error.message}`);
  }

  const seenRates = new Set<string>();
  const referenceRates = ((rateResponse.data ?? []) as Row[]).flatMap((row) => {
    const indexId = text(row.reference_rate_index_id);
    const index = related(row.index);
    if (!indexId || seenRates.has(indexId) || index.active !== true) return [];
    seenRates.add(indexId);
    return [{
      indexId,
      name: text(index.name),
      family: text(index.family) as 'TERM_SOFR' | 'TERM_SHIBOR',
      currency: text(index.currency),
      tenorMonths: number(index.tenor_months) as 1 | 3 | 6 | 12,
      ratePct: number(row.rate_pct),
      effectiveDate: text(row.effective_date),
    }];
  });

  return {
    issuingBankQuotations: ((issuingResponse.data ?? []) as Row[]).map(mapIssuingQuotation),
    nonIssuingBankQuotations: ((nonIssuingResponse.data ?? []) as Row[]).map(mapNonIssuingQuotation),
    referenceRates,
  };
}

function mapIssuingQuotation(row: Row): IssuingBankQuotation {
  return {
    ...mapQuotationBase(row),
    productType: 'issuingBankFees',
    versions: rows(row.versions).map((version) => ({
      ...mapVersionBase(version),
      pricing: mapFeeRows(version.pricing).map((fee): IssuingBankFeeRecord => ({
        ...fee,
        kind: fee.kind as IssuingBankFeeRecord['kind'],
      })),
    })),
  };
}

function mapNonIssuingQuotation(row: Row): NonIssuingBankQuotation {
  return {
    ...mapQuotationBase(row),
    productType: 'lcFinancing',
    issuingInstitutionIds: rows(row.issuing_institutions).map((item) => text(item.institution_id)),
    versions: rows(row.versions).map((version) => ({
      ...mapVersionBase(version),
      pricing: rows(version.pricing)
        .sort((a, b) => number(a.display_order) - number(b.display_order))
        .map((fee): NonIssuingBankFeeRecord => {
          const mapped = mapFee(fee);
          return {
            ...mapped,
            kind: mapped.kind as NonIssuingBankFeeRecord['kind'],
            applicableSolutions: stringArray(fee.applicable_solutions),
          };
        }),
    })),
  };
}

function mapQuotationBase(row: Row) {
  return {
    id: text(row.id),
    reference: text(row.reference),
    institution: mapInstitution(related(row.institution)),
    currency: text(row.currency),
    tenorDays: optionalNumber(row.tenor_days),
    minAmount: optionalNumber(row.min_amount),
    maxAmount: optionalNumber(row.max_amount),
  };
}

function mapVersionBase(row: Row) {
  return {
    id: text(row.id),
    version: number(row.version),
    status: text(row.status) as 'draft' | 'active' | 'superseded' | 'withdrawn',
    validFrom: text(row.valid_from),
    validTo: optionalText(row.valid_to),
  };
}

function mapFeeRows(value: unknown): Array<BaseFeeRecord<FeeKind>> {
  return rows(value)
    .sort((a, b) => number(a.display_order) - number(b.display_order))
    .map(mapFee);
}

function mapFee(fee: Row): BaseFeeRecord<FeeKind> {
  return {
    id: text(fee.id),
    feeCode: text(fee.fee_code),
    label: text(fee.label),
    kind: camelFeeKind(text(fee.component_kind)),
    disclosureStatus: text(
      fee.disclosure_status,
    ) as BaseFeeRecord<FeeKind>['disclosureStatus'],
    rate: mapRate(fee),
    startEvent: camelEvent(optionalText(fee.start_event_name)),
    endEvent: camelEvent(optionalText(fee.end_event_name)),
    dayCountConvention: optionalText(fee.day_count_convention) as BaseFeeRecord<FeeKind>['dayCountConvention'],
    billingFrequency: optionalText(fee.billing_frequency) as BaseFeeRecord<FeeKind>['billingFrequency'],
    partialPeriodRounding: optionalText(fee.partial_period_rounding) as BaseFeeRecord<FeeKind>['partialPeriodRounding'],
    minimumPeriodDays: optionalNumber(fee.minimum_period_days),
    minimumFeeAmount: optionalNumber(fee.minimum_fee_amount),
    includeStartDate: fee.include_start_date === true,
    includeEndDate: fee.include_end_date !== false,
  };
}

function mapRate(row: Row): PricingRate | undefined {
  if (row.rate_type == null) return undefined;
  switch (text(row.rate_type)) {
    case 'fixed_amount': return { type: 'fixedAmount', amount: number(row.fixed_amount) };
    case 'flat_percentage': return { type: 'flatPercentage', ratePct: number(row.rate_pct) };
    case 'annualized_percentage': return { type: 'annualizedPercentage', ratePct: number(row.rate_pct) };
    case 'reference_plus_spread':
      return {
        type: 'referencePlusSpread',
        referenceRateFamily: text(row.reference_rate_family) as 'TERM_SOFR' | 'TERM_SHIBOR',
        spreadPct: number(row.spread_pct),
      };
    default: throw new Error(`Unsupported fee rate type: ${text(row.rate_type)}.`);
  }
}

function camelFeeKind(value: string): FeeKind {
  const values: Record<string, FeeKind> = {
    issuing_fee: 'issuingFee', confirmation_fee: 'confirmationFee',
    deferred_payment_fee: 'deferredPaymentFee', discounting: 'discounting',
    forfaiting: 'forfaiting', advising_fee: 'advisingFee', negotiation_fee: 'negotiationFee',
    swift_fee: 'swiftFee', handling_fee: 'handlingFee',
    other_administrative_fee: 'otherAdministrativeFee',
  };
  const result = values[value];
  if (!result) throw new Error(`Unsupported fee component kind: ${value}.`);
  return result;
}

function mapInstitution(row: Row): Institution {
  return {
    id: text(row.id),
    name: text(row.name),
    type: mapInstitutionType(text(row.institution_type)),
    active: row.active === true,
  };
}

function mapInstitutionType(value: string): InstitutionType {
  if (value === 'trading_house') return 'tradingHouse';
  if (value === 'insurance_company') return 'insuranceCompany';
  return value as InstitutionType;
}

function camelEvent(value?: string) {
  if (!value) return undefined;
  const segments = value.split('_');
  return segments.map((segment, index) =>
    index === 0 ? segment : segment[0].toUpperCase() + segment.slice(1),
  ).join('') as BaseFeeRecord<FeeKind>['startEvent'];
}

function stringArray(value: unknown): NonIssuingBankFeeRecord['applicableSolutions'] {
  return Array.isArray(value)
    ? value.map((item) => camelSolution(String(item)))
    : [];
}

function camelSolution(
  value: string,
): NonIssuingBankFeeRecord['applicableSolutions'][number] {
  const values: Record<
    string,
    NonIssuingBankFeeRecord['applicableSolutions'][number]
  > = {
    confirmation_only: 'confirmationOnly',
    confirmation_with_discounting: 'confirmationWithDiscounting',
    discounting_only: 'discountingOnly',
    forfaiting_only: 'forfaitingOnly',
    confirmation_with_forfaiting: 'confirmationWithForfaiting',
  };
  const result = values[value];
  if (!result) throw new Error(`Unsupported applicable solution: ${value}.`);
  return result;
}

function related(value: unknown): Row {
  if (Array.isArray(value)) return (value[0] ?? {}) as Row;
  return value && typeof value === 'object' ? value as Row : {};
}
function rows(value: unknown): Row[] { return Array.isArray(value) ? value as Row[] : []; }
function text(value: unknown): string { return value == null ? '' : String(value); }
function optionalText(value: unknown): string | undefined { return value == null ? undefined : String(value); }
function number(value: unknown): number { return Number(value); }
function optionalNumber(value: unknown): number | undefined { return value == null ? undefined : Number(value); }
