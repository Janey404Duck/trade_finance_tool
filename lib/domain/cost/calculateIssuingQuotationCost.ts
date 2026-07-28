import type {
  ComparisonMode,
  IssuingBankQuotation,
  IssuingBankQuotationVersion,
} from '../quotation/model';
import { calculateFeeLine } from './calculateFeeLine';
import type { FeeCalculationContext, IssuingBankQuotationCost } from './model';

export function calculateIssuingQuotationCost(
  quotation: IssuingBankQuotation,
  version: IssuingBankQuotationVersion,
  mode: ComparisonMode,
  context: FeeCalculationContext,
): IssuingBankQuotationCost {
  const pricing = version.pricing.filter(
    (record) => record.kind === 'issuingFee' || mode === 'allAvailableFees',
  );
  const lines = pricing.map((record) =>
    calculateFeeLine(record, context, {
      quotationSide: 'issuingBank',
      quotationId: quotation.id,
      quotationVersionId: version.id,
      institutionId: quotation.institution.id,
      institutionName: quotation.institution.name,
    }),
  );
  const coreCost = sum(lines, 'issuingFee');
  const administrativeCost = sum(lines, 'swiftFee');
  return {
    quotationId: quotation.id,
    quotationReference: quotation.reference,
    quotationVersionId: version.id,
    institutionId: quotation.institution.id,
    institutionName: quotation.institution.name,
    lines,
    coreCost,
    administrativeCost,
    totalCost: coreCost + administrativeCost,
  };
}

function sum(lines: IssuingBankQuotationCost['lines'], kind: 'issuingFee' | 'swiftFee') {
  return lines
    .filter((line) => line.kind === kind)
    .reduce((total, line) => total + line.finalCost, 0);
}
