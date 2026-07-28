import type {
  BaseFeeRecord,
  FeeKind,
  PricingRate,
  TermReferenceRateFamily,
  TermReferenceRateTenorMonths,
} from '../quotation/model';
import type { CostLine, FeeCalculationContext } from './model';

type FeeProvenance = Pick<
  CostLine,
  | 'quotationSide'
  | 'quotationId'
  | 'quotationVersionId'
  | 'institutionId'
  | 'institutionName'
>;

export function calculateFeeLine<Kind extends FeeKind>(
  record: BaseFeeRecord<Kind>,
  context: FeeCalculationContext,
  provenance: FeeProvenance,
): CostLine {
  validateFeeRecord(record);
  const common = {
    ...provenance,
    feeRecordId: record.id,
    feeCode: record.feeCode,
    label: record.label,
    kind: record.kind,
    disclosureStatus: record.disclosureStatus,
  };

  if (record.disclosureStatus !== 'priced') {
    return { ...common, calculatedCost: 0, finalCost: 0 };
  }
  if (!record.rate) throw new Error(`Priced fee "${record.label}" requires a rate.`);

  const period = resolvePeriod(record, context);
  const conventionDays =
    record.dayCountConvention === '30/360' && period.start && period.end
      ? thirty360Days(period.start.date, period.end.date) +
        (record.includeStartDate ? 1 : 0) -
        (record.includeEndDate === false ? 1 : 0)
      : period.chargeDays;
  const effectiveDays = resolveBillingDays(record, conventionDays);
  const calculated = calculateBaseCost(
    record,
    context,
    effectiveDays,
    period.chargeDays,
  );
  const finalCost = Math.max(calculated.calculatedCost, record.minimumFeeAmount ?? 0);

  return {
    ...common,
    startDay: period.start?.day,
    endDay: period.end?.day,
    chargeDays: effectiveDays,
    rate: record.rate,
    referenceRate: calculated.referenceRate,
    baseRatePct: calculated.baseRatePct,
    effectiveRatePct: calculated.effectiveRatePct,
    dayCountConvention: record.dayCountConvention,
    calculatedCost: calculated.calculatedCost,
    finalCost,
  };
}

function validateFeeRecord(record: BaseFeeRecord<FeeKind>): void {
  if (record.disclosureStatus === 'priced' && !record.rate) {
    throw new Error(`Priced fee "${record.label}" requires a rate.`);
  }
  if (record.disclosureStatus !== 'priced' && record.rate) {
    throw new Error(
      `Fee "${record.label}" cannot have a rate when it is ${record.disclosureStatus}.`,
    );
  }
  if (
    record.disclosureStatus === 'priced' &&
    (record.kind === 'discounting' || record.kind === 'forfaiting') &&
    record.rate?.type !== 'referencePlusSpread'
  ) {
    throw new Error(`Financing fee "${record.label}" requires term reference-rate pricing.`);
  }
}

function resolvePeriod(record: BaseFeeRecord<FeeKind>, context: FeeCalculationContext) {
  if (!record.startEvent && !record.endEvent) {
    return { start: undefined, end: undefined, chargeDays: undefined };
  }
  if (!record.startEvent || !record.endEvent) {
    throw new Error(`Fee record "${record.label}" must define both period events.`);
  }
  const start = context.timeline.events[record.startEvent];
  const end = context.timeline.events[record.endEvent];
  if (!start || !end) {
    throw new Error(`Fee record "${record.label}" references an unresolved timeline event.`);
  }
  const inclusiveAdjustment =
    (record.includeStartDate ? 1 : 0) - (record.includeEndDate === false ? 1 : 0);
  const chargeDays = end.day - start.day + inclusiveAdjustment;
  if (chargeDays < 0) {
    throw new Error(`Pricing period for "${record.label}" ends before it starts.`);
  }
  return { start, end, chargeDays };
}

function resolveBillingDays(
  record: BaseFeeRecord<FeeKind>,
  days?: number,
): number | undefined {
  if (days == null) return undefined;
  let result = Math.max(days, record.minimumPeriodDays ?? 0);
  if (record.partialPeriodRounding === 'up') {
    const period = record.billingFrequency === 'monthly' ? 30 : 90;
    if (record.billingFrequency === 'monthly' || record.billingFrequency === 'quarterly') {
      result = Math.ceil(result / period) * period;
    }
  }
  return result;
}

function calculateBaseCost(
  record: BaseFeeRecord<FeeKind>,
  context: FeeCalculationContext,
  chargeDays?: number,
  financingPeriodDays?: number,
): {
  calculatedCost: number;
  referenceRate?: CostLine['referenceRate'];
  baseRatePct?: number;
  effectiveRatePct?: number;
} {
  const rate = record.rate as PricingRate;
  switch (rate.type) {
    case 'fixedAmount':
      return { calculatedCost: rate.amount };
    case 'flatPercentage':
      return {
        calculatedCost: context.amount * rate.ratePct / 100,
        effectiveRatePct: rate.ratePct,
      };
    case 'annualizedPercentage':
      return {
        calculatedCost:
          context.amount * rate.ratePct / 100 * dayCountFraction(record, chargeDays),
        effectiveRatePct: rate.ratePct,
      };
    case 'referencePlusSpread': {
      if (financingPeriodDays == null) {
        throw new Error(
          `Term reference-rate fee "${record.label}" requires a financing period.`,
        );
      }
      assertFamilyMatchesCurrency(rate.referenceRateFamily, context.currency);
      const tenorMonths = resolveTermRateTenorMonths(financingPeriodDays);
      const referenceRate = context.referenceRates.find(
        (candidate) =>
          candidate.family === rate.referenceRateFamily &&
          candidate.currency.toUpperCase() === context.currency.toUpperCase() &&
          candidate.tenorMonths === tenorMonths,
      );
      if (!referenceRate) {
        throw new Error(
          `${tenorMonths}M ${rate.referenceRateFamily} is unavailable for ${context.currency.toUpperCase()}.`,
        );
      }
      const effectiveRatePct = referenceRate.ratePct + rate.spreadPct;
      return {
        calculatedCost:
          context.amount * effectiveRatePct / 100 * dayCountFraction(record, chargeDays),
        referenceRate,
        baseRatePct: referenceRate.ratePct,
        effectiveRatePct,
      };
    }
  }
}

export function resolveTermRateTenorMonths(
  periodDays: number,
): TermReferenceRateTenorMonths {
  if (!Number.isInteger(periodDays) || periodDays < 0) {
    throw new Error('The financing period must be a nonnegative whole number of days.');
  }
  if (periodDays <= 30) return 1;
  if (periodDays <= 90) return 3;
  if (periodDays <= 180) return 6;
  if (periodDays <= 360) return 12;
  throw new Error(`No supported term-rate tenor covers a ${periodDays}-day financing period.`);
}

function assertFamilyMatchesCurrency(
  family: TermReferenceRateFamily,
  currency: string,
): void {
  const normalizedCurrency = currency.toUpperCase();
  const expectedFamily =
    normalizedCurrency === 'USD'
      ? 'TERM_SOFR'
      : normalizedCurrency === 'CNY'
        ? 'TERM_SHIBOR'
        : undefined;
  if (!expectedFamily) {
    throw new Error(`No term reference-rate family is configured for ${normalizedCurrency}.`);
  }
  if (family !== expectedFamily) {
    throw new Error(
      `${family} cannot price a ${normalizedCurrency} quotation; expected ${expectedFamily}.`,
    );
  }
}

function dayCountFraction(record: BaseFeeRecord<FeeKind>, chargeDays?: number): number {
  if (chargeDays == null) {
    throw new Error(`Annualized fee "${record.label}" requires a pricing period.`);
  }
  return chargeDays / (record.dayCountConvention === 'ACT/365' ? 365 : 360);
}

function thirty360Days(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const day1 = Math.min(startDay, 30);
  const day2 = startDay >= 30 ? Math.min(endDay, 30) : endDay;
  return (endYear - startYear) * 360 + (endMonth - startMonth) * 30 + day2 - day1;
}
