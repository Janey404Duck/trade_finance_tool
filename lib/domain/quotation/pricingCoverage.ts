import type { FinancingSelection } from '../financing/model';
import type {
  PricingComponentKind,
  PricingCondition,
  PricingRecord,
} from './model';

export function findMissingPricingCoverage(
  pricing: PricingRecord[],
  selection: FinancingSelection,
): string[] {
  const missing: string[] = [];

  if (
    selection.confirmationRequired &&
    !hasApplicableComponent(pricing, 'confirmationFee', true)
  ) {
    missing.push('confirmation pricing');
  }
  if (
    selection.discounting &&
    !hasApplicableComponent(
      pricing,
      'discounting',
      selection.confirmationRequired,
      true,
    )
  ) {
    missing.push(
      selection.confirmationRequired
        ? 'discounting pricing with confirmation'
        : 'discounting pricing without confirmation',
    );
  }
  if (
    selection.forfaiting &&
    !hasApplicableComponent(
      pricing,
      'forfaiting',
      selection.confirmationRequired,
      true,
    )
  ) {
    missing.push(
      selection.confirmationRequired
        ? 'forfaiting pricing with confirmation'
        : 'forfaiting pricing without confirmation',
    );
  }

  return missing;
}

export function hasPricingCoverage(
  pricing: PricingRecord[],
  selection: FinancingSelection,
): boolean {
  return findMissingPricingCoverage(pricing, selection).length === 0;
}

function hasApplicableComponent(
  pricing: PricingRecord[],
  kind: PricingComponentKind,
  confirmationRequired: boolean,
  requireTermReferenceRate = false,
): boolean {
  return pricing.some(
    (record) =>
      record.kind === kind &&
      conditionMatches(record.condition, confirmationRequired) &&
      (!requireTermReferenceRate || record.rate.type === 'referencePlusSpread'),
  );
}

function conditionMatches(
  condition: PricingCondition,
  confirmationRequired: boolean,
): boolean {
  return (
    condition === 'always' ||
    (condition === 'confirmationRequired' && confirmationRequired) ||
    (condition === 'confirmationNotRequired' && !confirmationRequired)
  );
}
