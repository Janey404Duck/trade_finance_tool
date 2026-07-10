import type { CalculateInput, QuotePackage } from './types';

export type EligibilityResult = {
  eligible: boolean;
  reason?: string;
};

export function evaluateQuotePackageEligibility(
  quotePackage: QuotePackage,
  input: CalculateInput,
  quotePackageIssuingBanks: Array<{ quotePackageId: string; issuingBankId: string }>,
  today = new Date(),
): EligibilityResult {
  if (!quotePackage.active) {
    return { eligible: false, reason: 'Quote package is inactive.' };
  }

  if (quotePackage.currency.toUpperCase() !== input.currency.toUpperCase()) {
    return { eligible: false, reason: 'Currency does not match.' };
  }

  if (quotePackage.validFrom && compareDateOnly(today, quotePackage.validFrom) < 0) {
    return { eligible: false, reason: 'Quote package is not yet valid.' };
  }

  if (quotePackage.validTo && compareDateOnly(today, quotePackage.validTo) > 0) {
    return { eligible: false, reason: 'Quote package has expired.' };
  }

  if (quotePackage.minAmount != null && input.transactionAmount < quotePackage.minAmount) {
    return { eligible: false, reason: 'Transaction amount is below package minimum.' };
  }

  if (quotePackage.maxAmount != null && input.transactionAmount > quotePackage.maxAmount) {
    return { eligible: false, reason: 'Transaction amount exceeds package maximum.' };
  }

  if (quotePackage.minMaturityDays != null && input.maturityDays < quotePackage.minMaturityDays) {
    return { eligible: false, reason: 'LC maturity is below package minimum.' };
  }

  if (quotePackage.maxMaturityDays != null && input.maturityDays > quotePackage.maxMaturityDays) {
    return { eligible: false, reason: 'LC maturity exceeds package maximum.' };
  }

  if (!quotePackage.appliesToAllIssuingBanks) {
    const allowed = quotePackageIssuingBanks.some(
      (row) =>
        row.quotePackageId === quotePackage.id && row.issuingBankId === input.issuingBankId,
    );

    if (!allowed) {
      return { eligible: false, reason: 'Issuing bank is not accepted by quote package.' };
    }
  }

  return { eligible: true };
}

function compareDateOnly(date: Date, isoDate: string): number {
  const current = date.toISOString().slice(0, 10);
  return current.localeCompare(isoDate);
}
