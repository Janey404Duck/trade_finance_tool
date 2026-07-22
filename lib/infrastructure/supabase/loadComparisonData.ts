import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompareScenarioDependencies } from '@/lib/application/compareScenario';
import type {
  Institution,
  InstitutionFeeSchedule,
  InstitutionRole,
  InstitutionType,
  PricingComponentKind,
  PricingRate,
  PricingRecord,
  Quotation,
} from '@/lib/domain/quotation/model';

type Row = Record<string, unknown>;

const feeSelection = `
  id, fee_code, label, component_kind, disclosure_status, inclusion_mode,
  charged_by_institution_id, charged_by_role, required_components, excluded_components,
  rate_type, fixed_amount, rate_pct, reference_rate_family, spread_pct,
  start_event_name, end_event_name, day_count_convention, billing_frequency,
  partial_period_rounding, minimum_period_days, minimum_fee_amount,
  include_start_date, include_end_date, display_order
`;

export async function loadComparisonData(
  supabase: SupabaseClient,
  asOfDate: string,
): Promise<CompareScenarioDependencies> {
  const [quotationResponse, scheduleResponse, rateResponse] = await Promise.all([
    supabase
      .from('quotations')
      .select(`
        id, reference, currency, product_type, tenor_days, min_amount, max_amount,
        institution:institutions!quotations_institution_id_fkey(id, name, institution_type, active),
        versions:quotation_versions(
          id, version, status, valid_from, valid_to,
          pricing:fee_records!fee_records_quotation_version_id_fkey(${feeSelection})
        ),
        issuing_institutions:quotation_issuing_institutions(institution_id)
      `),
    supabase
      .from('institution_fee_schedules')
      .select(`
        id, currency, institution_role, status, valid_from, valid_to,
        institution:institutions!institution_fee_schedules_institution_id_fkey(
          id, name, institution_type, active
        ),
        pricing:fee_records!fee_records_institution_fee_schedule_id_fkey(${feeSelection})
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

  if (quotationResponse.error) {
    throw new Error(`Unable to load quotations: ${quotationResponse.error.message}`);
  }
  if (scheduleResponse.error) {
    throw new Error(`Unable to load institution fee schedules: ${scheduleResponse.error.message}`);
  }
  if (rateResponse.error) {
    throw new Error(`Unable to load reference rates: ${rateResponse.error.message}`);
  }

  const quotations = ((quotationResponse.data ?? []) as Row[]).map(mapQuotation);
  const institutionFeeSchedules = ((scheduleResponse.data ?? []) as Row[]).map(mapSchedule);
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

  return { quotations, institutionFeeSchedules, referenceRates };
}

function mapQuotation(row: Row): Quotation {
  return {
    id: text(row.id),
    reference: text(row.reference),
    institution: mapInstitution(related(row.institution)),
    currency: text(row.currency),
    productType: 'lcFinancing',
    tenorDays: optionalNumber(row.tenor_days),
    minAmount: optionalNumber(row.min_amount),
    maxAmount: optionalNumber(row.max_amount),
    issuingInstitutionIds: rows(row.issuing_institutions).map((item) => text(item.institution_id)),
    versions: rows(row.versions).map((version) => ({
      id: text(version.id),
      version: number(version.version),
      status: text(version.status) as Quotation['versions'][number]['status'],
      validFrom: text(version.valid_from),
      validTo: optionalText(version.valid_to),
      pricing: mapPricingRows(version.pricing, 'quotation', text(version.id)),
    })),
  };
}

function mapSchedule(row: Row): InstitutionFeeSchedule {
  return {
    id: text(row.id),
    institution: mapInstitution(related(row.institution)),
    currency: text(row.currency),
    role: camelRole(text(row.institution_role)),
    status: text(row.status) as InstitutionFeeSchedule['status'],
    validFrom: text(row.valid_from),
    validTo: optionalText(row.valid_to),
    pricing: mapPricingRows(row.pricing, 'institutionSchedule', text(row.id)),
  };
}

function mapPricingRows(
  value: unknown,
  source: PricingRecord['source'],
  sourceId: string,
): PricingRecord[] {
  return rows(value)
    .sort((a, b) => number(a.display_order) - number(b.display_order))
    .map((pricing) => ({
      id: text(pricing.id),
      feeCode: text(pricing.fee_code),
      label: text(pricing.label),
      kind: camelComponent(text(pricing.component_kind)),
      disclosureStatus: camelDisclosure(text(pricing.disclosure_status)),
      inclusionMode: pricing.inclusion_mode === 'conditional' ? 'conditional' : 'automatic',
      chargedByInstitutionId: text(pricing.charged_by_institution_id),
      chargedByRole: camelRole(text(pricing.charged_by_role)),
      requiredComponents: rowsOrStrings(pricing.required_components),
      excludedComponents: rowsOrStrings(pricing.excluded_components),
      rate: mapRate(pricing),
      startEvent: camelEvent(optionalText(pricing.start_event_name)),
      endEvent: camelEvent(optionalText(pricing.end_event_name)),
      dayCountConvention: optionalText(pricing.day_count_convention) as PricingRecord['dayCountConvention'],
      billingFrequency: optionalText(pricing.billing_frequency) as PricingRecord['billingFrequency'],
      partialPeriodRounding: optionalText(pricing.partial_period_rounding) as PricingRecord['partialPeriodRounding'],
      minimumPeriodDays: optionalNumber(pricing.minimum_period_days),
      minimumFeeAmount: optionalNumber(pricing.minimum_fee_amount),
      includeStartDate: pricing.include_start_date === true,
      includeEndDate: pricing.include_end_date !== false,
      source,
      sourceId,
    }));
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

function camelComponent(value: string): PricingComponentKind {
  const values: Record<string, PricingComponentKind> = {
    issuing_fee: 'issuingFee', confirmation_fee: 'confirmationFee',
    deferred_payment_fee: 'deferredPaymentFee', discounting: 'discounting', forfaiting: 'forfaiting',
    advising_fee: 'advisingFee', negotiation_fee: 'negotiationFee', amendment_fee: 'amendmentFee',
    swift_fee: 'swiftFee', discrepancy_fee: 'discrepancyFee', handling_fee: 'handlingFee',
    other_administrative_fee: 'otherAdministrativeFee',
  };
  const result = values[value];
  if (!result) throw new Error(`Unsupported fee component kind: ${value}.`);
  return result;
}

function camelRole(value: string): InstitutionRole {
  const values: Record<string, InstitutionRole> = {
    issuing_bank: 'issuingBank', confirming_bank: 'confirmingBank', advising_bank: 'advisingBank',
    negotiating_bank: 'negotiatingBank', financing_provider: 'financingProvider',
  };
  const result = values[value];
  if (!result) throw new Error(`Unsupported institution role: ${value}.`);
  return result;
}

function camelDisclosure(value: string): PricingRecord['disclosureStatus'] {
  if (value === 'not_applicable') return 'notApplicable';
  return value as PricingRecord['disclosureStatus'];
}

function camelEvent(value?: string) {
  if (!value) return undefined;
  const segments = value.split('_');
  return segments.map((segment, index) =>
    index === 0 ? segment : segment[0].toUpperCase() + segment.slice(1),
  ).join('') as PricingRecord['startEvent'];
}

function rowsOrStrings(value: unknown): PricingRecord['requiredComponents'] {
  return Array.isArray(value) ? value.map(String) as PricingRecord['requiredComponents'] : [];
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
