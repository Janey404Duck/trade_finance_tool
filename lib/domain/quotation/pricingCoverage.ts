import { hasComponent, type ComparisonCase } from '../financing/model';
import type { PricingComponentKind, PricingRecord } from './model';
import { pricingRecordApplies } from './model';

export function findMissingPricingCoverage(
  pricing: PricingRecord[],
  comparisonCase: ComparisonCase,
): string[] {
  const missing: string[] = [];

  if (
    hasComponent(comparisonCase, 'confirmation') &&
    !hasUsableCoreComponent(pricing, 'confirmationFee', comparisonCase)
  ) {
    missing.push('confirmation pricing');
  }
  if (
    hasComponent(comparisonCase, 'discounting') &&
    !hasUsableCoreComponent(pricing, 'discounting', comparisonCase, true)
  ) {
    missing.push(
      hasComponent(comparisonCase, 'confirmation')
        ? 'discounting pricing with confirmation'
        : 'discounting pricing without confirmation',
    );
  }
  if (
    hasComponent(comparisonCase, 'forfaiting') &&
    !hasUsableCoreComponent(pricing, 'forfaiting', comparisonCase, true)
  ) {
    missing.push(
      hasComponent(comparisonCase, 'confirmation')
        ? 'forfaiting pricing with confirmation'
        : 'forfaiting pricing without confirmation',
    );
  }

  return missing;
}

export function hasPricingCoverage(
  pricing: PricingRecord[],
  comparisonCase: ComparisonCase,
): boolean {
  return findMissingPricingCoverage(pricing, comparisonCase).length === 0;
}

function hasUsableCoreComponent(
  pricing: PricingRecord[],
  kind: PricingComponentKind,
  comparisonCase: ComparisonCase,
  requireTermReferenceRate = false,
): boolean {
  return pricing.some((record) => {
    if (
      record.kind !== kind ||
      record.inclusionMode !== 'automatic' ||
      record.disclosureStatus === 'notApplicable' ||
      !pricingRecordApplies(record, comparisonCase)
    ) {
      return false;
    }
    if (record.disclosureStatus === 'waived') return true;
    return (
      record.rate != null &&
      (!requireTermReferenceRate || record.rate.type === 'referencePlusSpread')
    );
  });
}
