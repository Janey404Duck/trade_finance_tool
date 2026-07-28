import type { SolutionKind } from '../financing/model';
import type {
  ComparisonMode,
  NonIssuingBankQuotation,
  NonIssuingBankQuotationVersion,
} from '../quotation/model';
import {
  isNonIssuingAdministrativeFeeKind,
  isNonIssuingCoreFeeKind,
  nonIssuingFeeApplies,
} from '../quotation/model';
import { calculateFeeLine } from './calculateFeeLine';
import type { FeeCalculationContext, NonIssuingBankQuotationCost } from './model';

export function calculateNonIssuingQuotationCost(
  quotation: NonIssuingBankQuotation,
  version: NonIssuingBankQuotationVersion,
  solution: SolutionKind,
  mode: ComparisonMode,
  context: FeeCalculationContext,
): NonIssuingBankQuotationCost {
  const pricing = version.pricing.filter(
    (record) =>
      nonIssuingFeeApplies(record, solution) &&
      (mode === 'allAvailableFees' || isNonIssuingCoreFeeKind(record.kind)),
  );
  const lines = pricing.map((record) =>
    calculateFeeLine(record, context, {
      quotationSide: 'nonIssuingBank',
      quotationId: quotation.id,
      quotationVersionId: version.id,
      institutionId: quotation.institution.id,
      institutionName: quotation.institution.name,
    }),
  );
  const coreCost = lines
    .filter((line) =>
      line.quotationSide === 'nonIssuingBank' &&
      isNonIssuingCoreFeeKind(line.kind),
    )
    .reduce((total, line) => total + line.finalCost, 0);
  const administrativeCost = lines
    .filter((line) =>
      line.quotationSide === 'nonIssuingBank' &&
      isNonIssuingAdministrativeFeeKind(line.kind),
    )
    .reduce((total, line) => total + line.finalCost, 0);
  return {
    quotationId: quotation.id,
    quotationReference: quotation.reference,
    quotationVersionId: version.id,
    institutionId: quotation.institution.id,
    institutionName: quotation.institution.name,
    solution,
    lines,
    coreCost,
    administrativeCost,
    confirmationCost: sum(lines, 'confirmationFee'),
    deferredPaymentCost: sum(lines, 'deferredPaymentFee'),
    financingCost: sum(lines, 'discounting') + sum(lines, 'forfaiting'),
    totalCost: coreCost + administrativeCost,
  };
}

function sum(
  lines: NonIssuingBankQuotationCost['lines'],
  kind: NonIssuingBankQuotationCost['lines'][number]['kind'],
) {
  return lines
    .filter((line) => line.kind === kind)
    .reduce((total, line) => total + line.finalCost, 0);
}
