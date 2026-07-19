import type {
  Quotation,
  QuotationContext,
  QuotationFilter,
  QuotationVersion,
  SelectedQuotation,
} from './model';

export function selectQuotations(
  quotations: Quotation[],
  context: QuotationContext,
  filter: QuotationFilter = { includeAllApplicable: true },
): SelectedQuotation[] {
  return quotations.flatMap((quotation) => {
    if (!matchesFilter(quotation, filter) || !isApplicable(quotation, context)) return [];
    const version = latestActiveVersion(quotation.versions, context.asOfDate);
    return version ? [{ quotation, version }] : [];
  });
}

function matchesFilter(quotation: Quotation, filter: QuotationFilter): boolean {
  if (filter.includeAllApplicable) return true;
  const quotationMatch = filter.quotationIds?.includes(quotation.id) ?? false;
  const institutionMatch = filter.institutionIds?.includes(quotation.institution.id) ?? false;
  return quotationMatch || institutionMatch;
}

function isApplicable(quotation: Quotation, context: QuotationContext): boolean {
  if (!quotation.institution.active) return false;
  if (quotation.currency.toUpperCase() !== context.currency.toUpperCase()) return false;
  if (quotation.minAmount != null && context.amount < quotation.minAmount) return false;
  if (quotation.maxAmount != null && context.amount > quotation.maxAmount) return false;
  if (quotation.tenorDays != null && context.maturityDays > quotation.tenorDays) return false;
  if (
    quotation.issuingInstitutionIds.length > 0 &&
    (!context.issuingInstitutionId ||
      !quotation.issuingInstitutionIds.includes(context.issuingInstitutionId))
  ) {
    return false;
  }
  return true;
}

function latestActiveVersion(
  versions: QuotationVersion[],
  asOfDate: string,
): QuotationVersion | undefined {
  return versions
    .filter(
      (version) =>
        version.status === 'active' &&
        version.validFrom <= asOfDate &&
        (!version.validTo || version.validTo >= asOfDate),
    )
    .sort((a, b) => b.version - a.version)[0];
}
