import type { CalculateInput, Quote } from './types';

export type EligibilityResult = {
  eligible: boolean;
  reason?: string;
};

export function evaluateQuoteEligibility(
  quote: Quote,
  input: CalculateInput,
  quoteIssuingBanks: Array<{ quoteId: string; issuingBankId: string }>,
  today = new Date(),
): EligibilityResult {
  if (!quote.active) {
    return { eligible: false, reason: 'Quote is inactive.' };
  }

  if (quote.currency.toUpperCase() !== input.currency.toUpperCase()) {
    return { eligible: false, reason: 'Currency does not match.' };
  }

  if (quote.validFrom && compareDateOnly(today, quote.validFrom) < 0) {
    return { eligible: false, reason: 'Quote is not yet valid.' };
  }

  if (quote.validTo && compareDateOnly(today, quote.validTo) > 0) {
    return { eligible: false, reason: 'Quote has expired.' };
  }

  if (quote.minAmount != null && input.transactionAmount < quote.minAmount) {
    return { eligible: false, reason: 'Transaction amount is below quote minimum.' };
  }

  if (quote.maxAmount != null && input.transactionAmount > quote.maxAmount) {
    return { eligible: false, reason: 'Transaction amount exceeds quote maximum.' };
  }

  if (quote.minMaturityDays != null && input.lcMaturityDays < quote.minMaturityDays) {
    return { eligible: false, reason: 'LC maturity is below quote minimum.' };
  }

  if (quote.maxMaturityDays != null && input.lcMaturityDays > quote.maxMaturityDays) {
    return { eligible: false, reason: 'LC maturity exceeds quote maximum.' };
  }

  if (!quote.appliesToAllIssuingBanks) {
    const allowed = quoteIssuingBanks.some(
      (row) => row.quoteId === quote.id && row.issuingBankId === input.issuingBankId,
    );

    if (!allowed) {
      return { eligible: false, reason: 'Issuing bank is not accepted by quote.' };
    }
  }

  return { eligible: true };
}

function compareDateOnly(date: Date, isoDate: string): number {
  const current = date.toISOString().slice(0, 10);
  return current.localeCompare(isoDate);
}
