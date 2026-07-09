import { calculateChargeRule } from './calculateChargeRule';
import { evaluateQuoteEligibility } from './quoteEligibility';
import { resolveAnchorDays } from './resolveAnchorDay';
import type { CalculateInput, ChargeRule, Quote, QuoteCalculationResult, ScenarioData, ScenarioResult } from './types';

export function calculateScenario(
  input: CalculateInput,
  data: ScenarioData,
  today = new Date(),
): ScenarioResult {
  const assumptions = resolveAnchorDays(input);
  const selectedQuoteIds = new Set(input.selectedQuoteIds ?? []);
  const quotes = selectedQuoteIds.size
    ? data.quotes.filter((quote) => selectedQuoteIds.has(quote.id))
    : data.quotes;
  const issuingBankFeeRules = data.issuingBankFeeRules.filter(
    (rule) =>
      rule.active !== false &&
      (!rule.issuingBankId || rule.issuingBankId === input.issuingBankId) &&
      (!rule.currency || rule.currency.toUpperCase() === input.currency.toUpperCase()),
  );

  const results = quotes.map((quote) =>
    calculateQuoteResult({
      quote,
      input,
      data,
      quoteChargeRules: data.quoteChargeRules.filter(
        (rule) => rule.quoteId === quote.id && rule.active !== false,
      ),
      issuingBankFeeRules,
      today,
      assumptions,
    }),
  );

  return {
    assumptions,
    results: results.sort((a, b) => a.totalCost - b.totalCost),
  };
}

function calculateQuoteResult({
  quote,
  input,
  data,
  quoteChargeRules,
  issuingBankFeeRules,
  today,
  assumptions,
}: {
  quote: Quote;
  input: CalculateInput;
  data: ScenarioData;
  quoteChargeRules: ChargeRule[];
  issuingBankFeeRules: ChargeRule[];
  today: Date;
  assumptions: ReturnType<typeof resolveAnchorDays>;
}): QuoteCalculationResult {
  const eligibility = evaluateQuoteEligibility(quote, input, data.quoteIssuingBanks, today);

  if (!eligibility.eligible) {
    return {
      quoteId: quote.id,
      institutionId: quote.institutionId,
      institutionName: quote.institutionName,
      quoteName: quote.quoteName,
      financingType: quote.financingType,
      eligible: false,
      ineligibilityReason: eligibility.reason,
      externalQuoteCost: 0,
      issuingBankCost: 0,
      totalCost: 0,
      allInPct: 0,
      lines: [],
    };
  }

  const quoteLines = quoteChargeRules.map((rule) =>
    calculateChargeRule({
      rule,
      input,
      anchorDays: assumptions,
      referenceRates: data.referenceRates,
      sourceType: 'quote_charge_rule',
    }),
  );
  const issuingBankLines = issuingBankFeeRules.map((rule) =>
    calculateChargeRule({
      rule,
      input,
      anchorDays: assumptions,
      referenceRates: data.referenceRates,
      sourceType: 'issuing_bank_fee_rule',
    }),
  );
  const externalQuoteCost = sumFees(quoteLines);
  const issuingBankCost = sumFees(issuingBankLines);
  const totalCost = externalQuoteCost + issuingBankCost;

  return {
    quoteId: quote.id,
    institutionId: quote.institutionId,
    institutionName: quote.institutionName,
    quoteName: quote.quoteName,
    financingType: quote.financingType,
    eligible: true,
    externalQuoteCost,
    issuingBankCost,
    totalCost,
    allInPct: totalCost / input.transactionAmount * 100,
    lines: [...quoteLines, ...issuingBankLines].sort((a, b) => a.displayOrder - b.displayOrder),
  };
}

function sumFees(lines: Array<{ finalFee: number }>): number {
  return lines.reduce((total, line) => total + line.finalFee, 0);
}
