import { isEarlyPaymentSolution, type SolutionKind } from '../financing/model';
import type {
  IssuingBankFeeKind,
  IssuingBankFeeRecord,
  NonIssuingAdministrativeFeeKind,
  NonIssuingBankFeeRecord,
  NonIssuingCoreFeeKind,
} from './model';
import { nonIssuingFeeApplies } from './model';

export function findMissingIssuingCorePricing(
  pricing: IssuingBankFeeRecord[],
): IssuingBankFeeKind[] {
  return hasUsableFee(pricing, 'issuingFee') ? [] : ['issuingFee'];
}

export function findMissingNonIssuingCorePricing(
  pricing: NonIssuingBankFeeRecord[],
  solution: SolutionKind,
): NonIssuingCoreFeeKind[] {
  return requiredCoreFeeKinds(solution).filter(
    (kind) => !hasUsableNonIssuingFee(pricing, kind, solution),
  );
}

export function expectedAdministrativeFeeKinds(
  solution: SolutionKind,
): NonIssuingAdministrativeFeeKind[] {
  const kinds: NonIssuingAdministrativeFeeKind[] = [
    'advisingFee',
    'swiftFee',
    'handlingFee',
  ];
  if (isEarlyPaymentSolution(solution)) kinds.push('negotiationFee');
  return kinds;
}

export function findMissingNonIssuingAdministrativeFees(
  pricing: NonIssuingBankFeeRecord[],
  solution: SolutionKind,
): NonIssuingAdministrativeFeeKind[] {
  return expectedAdministrativeFeeKinds(solution).filter(
    (kind) =>
      !pricing.some(
        (record) =>
          record.kind === kind &&
          nonIssuingFeeApplies(record, solution),
      ),
  );
}

function requiredCoreFeeKinds(solution: SolutionKind): NonIssuingCoreFeeKind[] {
  switch (solution) {
    case 'confirmationOnly':
      return ['confirmationFee'];
    case 'confirmationWithDiscounting':
      return ['confirmationFee', 'discounting'];
    case 'discountingOnly':
      return ['discounting'];
    case 'forfaitingOnly':
      return ['forfaiting'];
    case 'confirmationWithForfaiting':
      return ['confirmationFee', 'forfaiting'];
  }
}

function hasUsableNonIssuingFee(
  pricing: NonIssuingBankFeeRecord[],
  kind: NonIssuingCoreFeeKind,
  solution: SolutionKind,
): boolean {
  return hasUsableFee(
    pricing.filter((record) => nonIssuingFeeApplies(record, solution)),
    kind,
    kind === 'discounting' || kind === 'forfaiting',
  );
}

function hasUsableFee(
  pricing: Array<IssuingBankFeeRecord | NonIssuingBankFeeRecord>,
  kind: IssuingBankFeeKind | NonIssuingCoreFeeKind,
  requireTermReferenceRate = false,
): boolean {
  return pricing.some((record) => {
    if (record.kind !== kind) return false;
    if (record.disclosureStatus === 'waived') return true;
    return (
      record.rate != null &&
      (!requireTermReferenceRate || record.rate.type === 'referencePlusSpread')
    );
  });
}
