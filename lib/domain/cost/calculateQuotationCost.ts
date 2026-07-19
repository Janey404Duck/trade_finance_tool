import { assertValidFinancingSelection } from '../financing/model';
import type {
  PricingRecord,
  Quotation,
  QuotationVersion,
  TermReferenceRateFamily,
  TermReferenceRateTenorMonths,
} from '../quotation/model';
import { findMissingPricingCoverage } from '../quotation/pricingCoverage';
import type {
  CostCalculationContext,
  CostLine,
  QuotationCost,
} from './model';

export function calculateQuotationCost(
  quotation: Quotation,
  version: QuotationVersion,
  context: CostCalculationContext,
): QuotationCost {
  assertValidFinancingSelection(context.financing);
  const missingPricing = findMissingPricingCoverage(
    version.pricing,
    context.financing,
  );
  if (missingPricing.length > 0) {
    throw new Error(
      `Quotation "${quotation.reference}" is ineligible: missing ${missingPricing.join(', ')}.`,
    );
  }
  const applicableRecords = version.pricing.filter((record) =>
    appliesToSelection(record, context),
  );
  const lines = applicableRecords.map((record) => calculateLine(record, context));

  const instrumentCost = sum(lines, 'instrumentFee');
  const confirmationCost = sum(lines, 'confirmationFee');
  const financingCost = sum(lines, 'discounting') + sum(lines, 'forfaiting');
  const totalCost = instrumentCost + confirmationCost + financingCost;

  return {
    quotationId: quotation.id,
    quotationReference: quotation.reference,
    quotationVersionId: version.id,
    institutionId: quotation.institution.id,
    institutionName: quotation.institution.name,
    currency: context.currency,
    amount: context.amount,
    lines,
    instrumentCost,
    confirmationCost,
    financingCost,
    totalCost,
    allInPct: context.amount === 0 ? 0 : (totalCost / context.amount) * 100,
  };
}

function appliesToSelection(
  record: PricingRecord,
  context: CostCalculationContext,
): boolean {
  if (record.kind === 'confirmationFee' && !context.financing.confirmationRequired) {
    return false;
  }
  if (record.kind === 'discounting' && !context.financing.discounting) return false;
  if (record.kind === 'forfaiting' && !context.financing.forfaiting) return false;

  if (record.condition === 'confirmationRequired') {
    return context.financing.confirmationRequired;
  }
  if (record.condition === 'confirmationNotRequired') {
    return !context.financing.confirmationRequired;
  }
  return true;
}

function calculateLine(
  record: PricingRecord,
  context: CostCalculationContext,
): CostLine {
  const period = resolvePeriod(record, context);
  const conventionDays =
    record.dayCountConvention === '30/360' && period.start && period.end
      ? thirty360Days(period.start.date, period.end.date) +
        (record.includeStartDate ? 1 : 0) -
        (record.includeEndDate === false ? 1 : 0)
      : period.chargeDays;
  const effectiveDays = resolveBillingDays(record, conventionDays);
  const { calculatedCost, referenceRate, baseRatePct, effectiveRatePct } =
    calculateBaseCost(
    record,
    context,
    effectiveDays,
    period.chargeDays,
  );
  const finalCost = Math.max(calculatedCost, record.minimumFeeAmount ?? 0);

  return {
    pricingRecordId: record.id,
    label: record.label,
    kind: record.kind,
    startDay: period.start?.day,
    endDay: period.end?.day,
    chargeDays: effectiveDays,
    rate: record.rate,
    referenceRate,
    baseRatePct,
    effectiveRatePct,
    dayCountConvention: record.dayCountConvention,
    calculatedCost,
    finalCost,
  };
}

function resolvePeriod(record: PricingRecord, context: CostCalculationContext) {
  if (!record.startEvent && !record.endEvent) {
    return {
      start: undefined,
      end: undefined,
      chargeDays: undefined,
    };
  }
  if (!record.startEvent || !record.endEvent) {
    throw new Error(`Pricing record "${record.label}" must define both period events.`);
  }
  const start = context.timeline.events[record.startEvent];
  const end = context.timeline.events[record.endEvent];
  if (!start || !end) {
    throw new Error(`Pricing record "${record.label}" references an unresolved timeline event.`);
  }
  const inclusiveAdjustment =
    (record.includeStartDate ? 1 : 0) - (record.includeEndDate === false ? 1 : 0);
  const chargeDays = end.day - start.day + inclusiveAdjustment;
  if (chargeDays < 0) {
    throw new Error(`Pricing period for "${record.label}" ends before it starts.`);
  }
  return { start, end, chargeDays };
}

function resolveBillingDays(record: PricingRecord, days?: number): number | undefined {
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
  record: PricingRecord,
  context: CostCalculationContext,
  chargeDays?: number,
  financingPeriodDays?: number,
) {
  switch (record.rate.type) {
    case 'fixedAmount':
      return { calculatedCost: record.rate.amount };
    case 'flatPercentage':
      return {
        calculatedCost: context.amount * record.rate.ratePct / 100,
        effectiveRatePct: record.rate.ratePct,
      };
    case 'annualizedPercentage':
      return {
        calculatedCost:
          context.amount *
          record.rate.ratePct /
          100 *
          dayCountFraction(record, chargeDays),
        effectiveRatePct: record.rate.ratePct,
      };
    case 'referencePlusSpread': {
      const rate = record.rate;
      if (financingPeriodDays == null) {
        throw new Error(
          `Term reference-rate pricing record "${record.label}" requires a financing period.`,
        );
      }
      assertFamilyMatchesCurrency(rate.referenceRateFamily, context.currency);
      const tenorMonths = resolveTermRateTenorMonths(financingPeriodDays);
      const reference = context.referenceRates.find(
        (candidate) =>
          candidate.family === rate.referenceRateFamily &&
          candidate.currency.toUpperCase() === context.currency.toUpperCase() &&
          candidate.tenorMonths === tenorMonths,
      );
      if (!reference) {
        throw new Error(
          `${tenorMonths}M ${rate.referenceRateFamily} is unavailable for ${context.currency.toUpperCase()}.`,
        );
      }
      const effectiveRatePct = reference.ratePct + rate.spreadPct;
      return {
        calculatedCost:
          context.amount *
          effectiveRatePct /
          100 *
          dayCountFraction(record, chargeDays),
        baseRatePct: reference.ratePct,
        effectiveRatePct,
        referenceRate: reference,
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
  throw new Error(
    `No supported term-rate tenor covers a ${periodDays}-day financing period.`,
  );
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
    throw new Error(
      `No term reference-rate family is configured for ${normalizedCurrency}.`,
    );
  }
  if (family !== expectedFamily) {
    throw new Error(
      `${family} cannot price a ${normalizedCurrency} quotation; expected ${expectedFamily}.`,
    );
  }
}

function dayCountFraction(
  record: PricingRecord,
  chargeDays?: number,
): number {
  if (chargeDays == null) {
    throw new Error(`Annualized pricing record "${record.label}" requires a pricing period.`);
  }
  const denominator = record.dayCountConvention === 'ACT/365' ? 365 : 360;
  return chargeDays / denominator;
}

function thirty360Days(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const day1 = Math.min(startDay, 30);
  const day2 = startDay >= 30 ? Math.min(endDay, 30) : endDay;
  return (endYear - startYear) * 360 + (endMonth - startMonth) * 30 + day2 - day1;
}

function sum(lines: CostLine[], kind: CostLine['kind']): number {
  return lines
    .filter((line) => line.kind === kind)
    .reduce((total, line) => total + line.finalCost, 0);
}
