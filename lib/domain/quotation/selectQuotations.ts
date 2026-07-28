import type {
  IssuingBankQuotation,
  NonIssuingBankQuotation,
  NonIssuingQuotationSelection,
  QuotationApplicabilityContext,
  QuotationVersionBase,
  SelectedIssuingBankQuotation,
  SelectedNonIssuingBankQuotation,
} from './model';

export function resolveIssuingBankQuotation(
  quotations: IssuingBankQuotation[],
  context: QuotationApplicabilityContext,
): SelectedIssuingBankQuotation {
  const matches = quotations.flatMap((quotation) => {
    if (
      quotation.institution.id !== context.issuingInstitutionId ||
      !isBaseApplicable(quotation, context)
    ) {
      return [];
    }
    const version = latestActiveVersion(quotation.versions, context.asOfDate);
    return version ? [{ quotation, version }] : [];
  });

  if (matches.length === 0) {
    throw new Error(
      'No applicable active issuing-bank quotation exists for the selected bank and transaction.',
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `The selected issuing bank has ${matches.length} applicable quotations; exactly one is required.`,
    );
  }
  return matches[0];
}

export function selectNonIssuingBankQuotations(
  quotations: NonIssuingBankQuotation[],
  context: QuotationApplicabilityContext,
  selection: NonIssuingQuotationSelection,
): SelectedNonIssuingBankQuotation[] {
  validateSelection(selection);
  if (selection.mode === 'quotations') {
    const selectedIds = new Set(selection.quotationIds);
    const selectedRows = quotations.filter((quotation) => selectedIds.has(quotation.id));
    const foundIds = new Set(selectedRows.map((quotation) => quotation.id));
    const missingIds = selection.quotationIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(`Unknown non-issuing quotation ids: ${missingIds.join(', ')}.`);
    }
    return selectedRows.map((quotation) => selectExplicitQuotation(quotation, context));
  }

  const institutionIds =
    selection.mode === 'institutions' ? new Set(selection.institutionIds) : undefined;
  const matches = quotations.flatMap((quotation) => {
    if (
      (institutionIds && !institutionIds.has(quotation.institution.id)) ||
      !isNonIssuingApplicable(quotation, context)
    ) {
      return [];
    }
    const version = latestActiveVersion(quotation.versions, context.asOfDate);
    return version ? [{ quotation, version }] : [];
  });
  if (matches.length === 0) {
    throw new Error('No applicable active non-issuing quotations match the selection.');
  }
  return matches;
}

function validateSelection(selection: NonIssuingQuotationSelection): void {
  const ids =
    selection.mode === 'institutions'
      ? selection.institutionIds
      : selection.mode === 'quotations'
        ? selection.quotationIds
        : undefined;
  if (!ids) return;
  if (ids.length === 0) {
    throw new Error(`Select at least one non-issuing ${selection.mode.slice(0, -1)}.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Selected non-issuing ${selection.mode} must be unique.`);
  }
}

function selectExplicitQuotation(
  quotation: NonIssuingBankQuotation,
  context: QuotationApplicabilityContext,
): SelectedNonIssuingBankQuotation {
  if (!isNonIssuingApplicable(quotation, context)) {
    throw new Error(
      `Non-issuing quotation "${quotation.reference}" is not applicable to this transaction.`,
    );
  }
  const version = latestActiveVersion(quotation.versions, context.asOfDate);
  if (!version) {
    throw new Error(
      `Non-issuing quotation "${quotation.reference}" has no active version on ${context.asOfDate}.`,
    );
  }
  return { quotation, version };
}

function isNonIssuingApplicable(
  quotation: NonIssuingBankQuotation,
  context: QuotationApplicabilityContext,
): boolean {
  return (
    isBaseApplicable(quotation, context) &&
    (quotation.issuingInstitutionIds.length === 0 ||
      quotation.issuingInstitutionIds.includes(context.issuingInstitutionId))
  );
}

function isBaseApplicable(
  quotation: IssuingBankQuotation | NonIssuingBankQuotation,
  context: QuotationApplicabilityContext,
): boolean {
  if (!quotation.institution.active) return false;
  if (quotation.currency.toUpperCase() !== context.currency.toUpperCase()) return false;
  if (quotation.minAmount != null && context.amount < quotation.minAmount) return false;
  if (quotation.maxAmount != null && context.amount > quotation.maxAmount) return false;
  if (quotation.tenorDays != null && context.maturityDays > quotation.tenorDays) return false;
  return true;
}

function latestActiveVersion<Pricing, Version extends QuotationVersionBase<Pricing>>(
  versions: Version[],
  asOfDate: string,
): Version | undefined {
  return versions
    .filter(
      (version) =>
        version.status === 'active' &&
        version.validFrom <= asOfDate &&
        (!version.validTo || version.validTo >= asOfDate),
    )
    .sort((a, b) => b.version - a.version)[0];
}
