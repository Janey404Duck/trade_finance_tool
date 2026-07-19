import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompareScenarioDependencies } from '@/lib/application/compareScenario';
import type {
  InstitutionType,
  PricingComponentKind,
  PricingCondition,
  PricingRate,
  Quotation,
} from '@/lib/domain/quotation/model';

type Row = Record<string, unknown>;

export async function loadComparisonData(
  supabase: SupabaseClient,
  asOfDate: string,
): Promise<CompareScenarioDependencies> {
  const [quotationResponse, rateResponse] = await Promise.all([
    supabase
      .from('quotations')
      .select(`
        id, reference, currency, product_type, tenor_days, min_amount, max_amount,
        institution:institutions!quotations_institution_id_fkey(id, name, institution_type, active),
        versions:quotation_versions(
          id, version, status, valid_from, valid_to,
          pricing:pricing_records(
            id, label, component_kind, pricing_condition, rate_type, fixed_amount,
            rate_pct, reference_rate_family, spread_pct, start_event_name,
            end_event_name, day_count_convention, billing_frequency,
            partial_period_rounding, minimum_period_days, minimum_fee_amount,
            include_start_date, include_end_date, display_order
          )
        ),
        issuing_institutions:quotation_issuing_institutions(institution_id)
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
  if (rateResponse.error) {
    throw new Error(`Unable to load reference rates: ${rateResponse.error.message}`);
  }

  const quotations = ((quotationResponse.data ?? []) as Row[]).map(mapQuotation);
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

  return { quotations, referenceRates };
}

function mapQuotation(row: Row): Quotation {
  const institution = related(row.institution);
  return {
    id: text(row.id),
    reference: text(row.reference),
    institution: {
      id: text(institution.id),
      name: text(institution.name),
      type: mapInstitutionType(text(institution.institution_type)),
      active: institution.active === true,
    },
    currency: text(row.currency),
    productType: 'lcFinancing',
    tenorDays: optionalNumber(row.tenor_days),
    minAmount: optionalNumber(row.min_amount),
    maxAmount: optionalNumber(row.max_amount),
    issuingInstitutionIds: rows(row.issuing_institutions).map((item) =>
      text(item.institution_id),
    ),
    versions: rows(row.versions).map((version) => ({
      id: text(version.id),
      version: number(version.version),
      status: text(version.status) as Quotation['versions'][number]['status'],
      validFrom: text(version.valid_from),
      validTo: optionalText(version.valid_to),
      pricing: rows(version.pricing)
        .sort((a, b) => number(a.display_order) - number(b.display_order))
        .map((pricing) => ({
          id: text(pricing.id),
          label: text(pricing.label),
          kind: camelComponent(text(pricing.component_kind)),
          condition: camelCondition(text(pricing.pricing_condition)),
          rate: mapRate(pricing),
          startEvent: camelEvent(optionalText(pricing.start_event_name)),
          endEvent: camelEvent(optionalText(pricing.end_event_name)),
          dayCountConvention: optionalText(pricing.day_count_convention) as
            | 'ACT/360'
            | 'ACT/365'
            | '30/360'
            | undefined,
          billingFrequency: optionalText(pricing.billing_frequency) as
            | 'once'
            | 'monthly'
            | 'quarterly'
            | undefined,
          partialPeriodRounding: optionalText(pricing.partial_period_rounding) as
            | 'actual'
            | 'up'
            | undefined,
          minimumPeriodDays: optionalNumber(pricing.minimum_period_days),
          minimumFeeAmount: optionalNumber(pricing.minimum_fee_amount),
          includeStartDate: pricing.include_start_date === true,
          includeEndDate: pricing.include_end_date !== false,
        })),
    })),
  };
}

function mapRate(row: Row): PricingRate {
  switch (text(row.rate_type)) {
    case 'fixed_amount':
      return { type: 'fixedAmount', amount: number(row.fixed_amount) };
    case 'flat_percentage':
      return { type: 'flatPercentage', ratePct: number(row.rate_pct) };
    case 'annualized_percentage':
      return { type: 'annualizedPercentage', ratePct: number(row.rate_pct) };
    case 'reference_plus_spread':
      return {
        type: 'referencePlusSpread',
        referenceRateFamily: text(row.reference_rate_family) as
          | 'TERM_SOFR'
          | 'TERM_SHIBOR',
        spreadPct: number(row.spread_pct),
      };
    default:
      throw new Error(`Unsupported pricing rate type: ${text(row.rate_type)}.`);
  }
}

function mapInstitutionType(value: string): InstitutionType {
  if (value === 'trading_house') return 'tradingHouse';
  if (value === 'insurance_company') return 'insuranceCompany';
  return value as InstitutionType;
}

function camelComponent(value: string): PricingComponentKind {
  const values: Record<string, PricingComponentKind> = {
    instrument_fee: 'instrumentFee',
    confirmation_fee: 'confirmationFee',
    discounting: 'discounting',
    forfaiting: 'forfaiting',
  };
  return values[value];
}

function camelCondition(value: string): PricingCondition {
  const values: Record<string, PricingCondition> = {
    always: 'always',
    confirmation_required: 'confirmationRequired',
    confirmation_not_required: 'confirmationNotRequired',
  };
  return values[value];
}

function camelEvent(value?: string) {
  if (!value) return undefined;
  const segments = value.split('_');
  return segments
    .map((segment, index) =>
      index === 0 ? segment : segment[0].toUpperCase() + segment.slice(1),
    )
    .join('') as Quotation['versions'][number]['pricing'][number]['startEvent'];
}

function related(value: unknown): Row {
  if (Array.isArray(value)) return (value[0] ?? {}) as Row;
  return value && typeof value === 'object' ? value as Row : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : [];
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function optionalText(value: unknown): string | undefined {
  return value == null ? undefined : String(value);
}

function number(value: unknown): number {
  return Number(value);
}

function optionalNumber(value: unknown): number | undefined {
  return value == null ? undefined : Number(value);
}
