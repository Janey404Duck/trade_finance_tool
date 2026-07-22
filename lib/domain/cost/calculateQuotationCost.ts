import { assertValidComparisonCase } from '../financing/model';
import type {
  PricingRecord,
  Quotation,
  QuotationVersion,
  TermReferenceRateFamily,
  TermReferenceRateTenorMonths,
} from '../quotation/model';
import {
  feeSlotKey,
  isAdministrativeFeeKind,
  isCoreFeeKind,
  pricingRecordApplies,
} from '../quotation/model';
import { findMissingPricingCoverage } from '../quotation/pricingCoverage';
import type { CostCalculationContext, CostLine, QuotationCost } from './model';

export function calculateQuotationCost(
  quotation: Quotation,
  version: QuotationVersion,
  context: CostCalculationContext,
  pricing: PricingRecord[] = version.pricing,
): QuotationCost {
  assertValidComparisonCase(context.comparisonCase);
  validatePricing(pricing);

  const missingPricing = findMissingPricingCoverage(pricing, context.comparisonCase);
  if (missingPricing.length > 0) {
    throw new Error(
      `Quotation "${quotation.reference}" is ineligible: missing ${missingPricing.join(', ')}.`,
    );
  }

  const applicableRecords = pricing.filter((record) => appliesToComparison(record, context));
  const lines = applicableRecords.map((record) => calculateLine(record, context));
  const coreCost = lines
    .filter((line) => isCoreFeeKind(line.kind))
    .reduce((total, line) => total + line.finalCost, 0);
  const administrativeCost = lines
    .filter((line) => isAdministrativeFeeKind(line.kind))
    .reduce((total, line) => total + line.finalCost, 0);
  const totalCost = coreCost + administrativeCost;
  const missingAdministrativeFeeSlots = findMissingAdministrativeSlots(
    applicableRecords,
    context,
  );

  return {
    quotationId: quotation.id,
    quotationReference: quotation.reference,
    quotationVersionId: version.id,
    institutionId: quotation.institution.id,
    institutionName: quotation.institution.name,
    comparisonCaseId: context.comparisonCase.id,
    comparisonCaseLabel: context.comparisonCase.label,
    selectedComponents: context.comparisonCase.components,
    comparisonMode: context.comparisonMode,
    currency: context.currency,
    amount: context.amount,
    lines,
    coreCost,
    administrativeCost,
    confirmationCost: sum(lines, 'confirmationFee'),
    deferredPaymentCost: sum(lines, 'deferredPaymentFee'),
    financingCost: sum(lines, 'discounting') + sum(lines, 'forfaiting'),
    totalCost,
    allInPct: context.amount === 0 ? 0 : (totalCost / context.amount) * 100,
    coverageStatus:
      missingAdministrativeFeeSlots.length === 0 ? 'complete' : 'incomplete',
    missingAdministrativeFeeSlots,
  };
}

function validatePricing(pricing: PricingRecord[]): void {
  for (const record of pricing) {
    if (isCoreFeeKind(record.kind) && record.inclusionMode === 'conditional') {
      throw new Error(`Core fee "${record.label}" cannot be conditional.`);
    }
    if (record.disclosureStatus === 'priced' && !record.rate) {
      throw new Error(`Priced fee "${record.label}" requires a rate.`);
    }
    if (
      record.disclosureStatus === 'priced' &&
      (record.kind === 'discounting' || record.kind === 'forfaiting') &&
      record.rate?.type !== 'referencePlusSpread'
    ) {
      throw new Error(`Financing fee "${record.label}" requires term reference-rate pricing.`);
    }
  }
}

function appliesToComparison(
  record: PricingRecord,
  context: CostCalculationContext,
): boolean {
  if (!pricingRecordApplies(record, context.comparisonCase)) return false;
  if (context.comparisonMode === 'coreFeesOnly' && !isCoreFeeKind(record.kind)) {
    return false;
  }
  if (record.inclusionMode === 'conditional') {
    return (
      isAdministrativeFeeKind(record.kind) &&
      (context.includedConditionalFeeKinds ?? []).includes(record.kind)
    );
  }
  return true;
}

function calculateLine(
  record: PricingRecord,
  context: CostCalculationContext,
): CostLine {
  const common = {
    pricingRecordId: record.id,
    feeCode: record.feeCode,
    label: record.label,
    kind: record.kind,
    inclusionMode: record.inclusionMode,
    disclosureStatus: record.disclosureStatus,
    chargedByInstitutionId: record.chargedByInstitutionId,
    chargedByRole: record.chargedByRole,
    source: record.source ?? 'quotation' as const,
    sourceId: record.sourceId,
  };

  if (record.disclosureStatus !== 'priced') {
    return { ...common, rate: record.rate, calculatedCost: 0, finalCost: 0 };
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
  const { calculatedCost, referenceRate, baseRatePct, effectiveRatePct } =
    calculateBaseCost(record, context, effectiveDays, period.chargeDays);
  const finalCost = Math.max(calculatedCost, record.minimumFeeAmount ?? 0);

  return {
    ...common,
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

function findMissingAdministrativeSlots(
  applicableRecords: PricingRecord[],
  context: CostCalculationContext,
) {
  if (context.comparisonMode === 'coreFeesOnly') return [];
  const disclosed = new Set(
    applicableRecords.flatMap((record) =>
      isAdministrativeFeeKind(record.kind)
        ? [feeSlotKey({ feeCode: record.feeCode, kind: record.kind, chargedByRole: record.chargedByRole })]
        : [],
    ),
  );
  return (context.expectedAdministrativeFeeSlots ?? []).filter(
    (slot) => !disclosed.has(feeSlotKey(slot)),
  );
}

function resolvePeriod(record: PricingRecord, context: CostCalculationContext) {
  if (!record.startEvent && !record.endEvent) {
    return { start: undefined, end: undefined, chargeDays: undefined };
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
  const rate = record.rate;
  if (!rate) throw new Error(`Priced fee "${record.label}" requires a rate.`);
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
          context.amount * effectiveRatePct / 100 * dayCountFraction(record, chargeDays),
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

function dayCountFraction(record: PricingRecord, chargeDays?: number): number {
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
