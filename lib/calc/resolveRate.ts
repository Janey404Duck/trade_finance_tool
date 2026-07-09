import type { ChargeRule, ReferenceRate } from './types';

export type ResolvedRate = {
  baseRatePct: number | null;
  effectiveRatePct: number | null;
  referenceRate?: ReferenceRate;
};

export function resolveRate(
  rule: ChargeRule,
  referenceRates: ReferenceRate[],
  currency: string,
): ResolvedRate {
  if (rule.rateType === 'annual_pct' || rule.rateType === 'flat_pct') {
    return {
      baseRatePct: null,
      effectiveRatePct: requireNumber(rule.fixedRatePct, `${rule.rateType} requires fixedRatePct`),
    };
  }

  if (rule.rateType === 'fixed_amount') {
    return {
      baseRatePct: null,
      effectiveRatePct: null,
    };
  }

  const baseRateKey = requireString(rule.baseRateKey, 'base_plus_spread requires baseRateKey');
  const spreadPct = requireNumber(rule.spreadPct, 'base_plus_spread requires spreadPct');
  const referenceRate = findLatestActiveReferenceRate(referenceRates, baseRateKey, currency);
  const effectiveRatePct = referenceRate.ratePct + spreadPct;

  return {
    baseRatePct: referenceRate.ratePct,
    effectiveRatePct,
    referenceRate,
  };
}

export function findLatestActiveReferenceRate(
  referenceRates: ReferenceRate[],
  rateKey: string,
  currency: string,
): ReferenceRate {
  const normalizedRateKey = rateKey.toUpperCase();
  const normalizedCurrency = currency.toUpperCase();
  const [latest] = referenceRates
    .filter(
      (rate) =>
        rate.active &&
        rate.rateKey.toUpperCase() === normalizedRateKey &&
        rate.currency.toUpperCase() === normalizedCurrency,
    )
    .sort((a, b) => b.rateDate.localeCompare(a.rateDate));

  if (!latest) {
    throw new Error(`No active reference rate found for ${normalizedRateKey}/${normalizedCurrency}`);
  }

  return latest;
}

function requireNumber(value: number | null | undefined, message: string): number {
  if (value == null || Number.isNaN(value)) {
    throw new Error(message);
  }

  return value;
}

function requireString(value: string | null | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }

  return value;
}
