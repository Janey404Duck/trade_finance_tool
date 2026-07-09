import { describe, expect, it } from 'vitest';
import { calculateScenario } from '@/lib/calc/calculateScenario';
import { resolveAnchorDays } from '@/lib/calc/resolveAnchorDay';
import type { CalculateInput, ScenarioData } from '@/lib/calc/types';

const input: CalculateInput = {
  issuingBankId: '20000000-0000-0000-0000-000000000001',
  currency: 'USD',
  transactionAmount: 1_000_000,
  lcMaturityDays: 360,
  shipmentDays: 30,
  paymentTermsDays: 105,
};

describe('resolveAnchorDays', () => {
  it('resolves canonical timeline anchors', () => {
    expect(resolveAnchorDays(input)).toEqual({
      LC_ISSUE_DAY: 0,
      SHIPMENT_DAY: 30,
      SUPPLIER_PAYMENT_DAY: 135,
      FINAL_MATURITY_DAY: 390,
    });
  });

  it('rejects supplier payment after final maturity', () => {
    expect(() =>
      resolveAnchorDays({
        ...input,
        lcMaturityDays: 60,
        paymentTermsDays: 90,
      }),
    ).toThrow(/Supplier payment day cannot be after final maturity day/);
  });
});

describe('calculateScenario', () => {
  it('filters quotes by issuing bank eligibility and totals eligible quote costs', () => {
    const result = calculateScenario(input, scenarioData, new Date('2026-07-09T12:00:00Z'));
    const natixis = result.results.find((quote) => quote.quoteId === 'quote-natixis');
    const restricted = result.results.find((quote) => quote.quoteId === 'quote-restricted');

    expect(natixis?.eligible).toBe(true);
    expect(natixis?.externalQuoteCost).toBeCloseTo(39_833.3333, 4);
    expect(natixis?.issuingBankCost).toBe(20_000);
    expect(natixis?.totalCost).toBeCloseTo(59_833.3333, 4);
    expect(natixis?.allInPct).toBeCloseTo(5.983333, 5);

    expect(restricted?.eligible).toBe(false);
    expect(restricted?.ineligibilityReason).toMatch(/Issuing bank/);
  });

  it('allows all issuing banks when quote applies globally', () => {
    const result = calculateScenario(
      {
        ...input,
        issuingBankId: '20000000-0000-0000-0000-000000000999',
      },
      scenarioData,
      new Date('2026-07-09T12:00:00Z'),
    );
    const globalQuote = result.results.find((quote) => quote.quoteId === 'quote-global');

    expect(globalQuote?.eligible).toBe(true);
  });
});

const scenarioData: ScenarioData = {
  quotes: [
    {
      id: 'quote-natixis',
      institutionId: 'institution-natixis',
      institutionName: 'Natixis',
      quoteName: 'Natixis USD Discounting',
      currency: 'USD',
      financingType: 'discounting',
      requiresConfirmation: true,
      appliesToAllIssuingBanks: false,
      active: true,
    },
    {
      id: 'quote-restricted',
      institutionId: 'institution-qnb',
      institutionName: 'QNB',
      quoteName: 'QNB Restricted',
      currency: 'USD',
      financingType: 'mixed',
      requiresConfirmation: true,
      appliesToAllIssuingBanks: false,
      active: true,
    },
    {
      id: 'quote-global',
      institutionId: 'institution-global',
      institutionName: 'Global Trading',
      quoteName: 'Global Forfaiting',
      currency: 'USD',
      financingType: 'forfaiting',
      requiresConfirmation: false,
      appliesToAllIssuingBanks: true,
      active: true,
    },
  ],
  quoteIssuingBanks: [
    {
      quoteId: 'quote-natixis',
      issuingBankId: '20000000-0000-0000-0000-000000000001',
    },
    {
      quoteId: 'quote-restricted',
      issuingBankId: '20000000-0000-0000-0000-000000000002',
    },
  ],
  quoteChargeRules: [
    {
      id: 'natixis-confirmation',
      quoteId: 'quote-natixis',
      chargeType: 'confirmation',
      payer: 'applicant',
      rateType: 'annual_pct',
      fixedRatePct: 0.8,
      amountBasis: 'transaction_amount',
      dayCountBasis: 360,
      startAnchor: 'LC_ISSUE_DAY',
      startOffsetDays: 0,
      endAnchor: 'SHIPMENT_DAY',
      endOffsetDays: 0,
      minFeeFrequency: 'none',
      displayOrder: 10,
      active: true,
    },
    {
      id: 'natixis-deferred',
      quoteId: 'quote-natixis',
      chargeType: 'deferred',
      payer: 'applicant',
      rateType: 'annual_pct',
      fixedRatePct: 0.8,
      amountBasis: 'transaction_amount',
      dayCountBasis: 360,
      startAnchor: 'SHIPMENT_DAY',
      startOffsetDays: 0,
      endAnchor: 'FINAL_MATURITY_DAY',
      endOffsetDays: 0,
      minFeeFrequency: 'none',
      displayOrder: 20,
      active: true,
    },
    {
      id: 'natixis-discounting',
      quoteId: 'quote-natixis',
      chargeType: 'discounting',
      payer: 'applicant',
      rateType: 'base_plus_spread',
      baseRateKey: 'COF',
      spreadPct: 0.2,
      amountBasis: 'transaction_amount',
      dayCountBasis: 360,
      startAnchor: 'SUPPLIER_PAYMENT_DAY',
      startOffsetDays: 0,
      endAnchor: 'FINAL_MATURITY_DAY',
      endOffsetDays: 0,
      minFeeFrequency: 'none',
      displayOrder: 30,
      active: true,
    },
    {
      id: 'global-forfaiting',
      quoteId: 'quote-global',
      chargeType: 'forfaiting',
      payer: 'applicant',
      rateType: 'annual_pct',
      fixedRatePct: 4,
      amountBasis: 'transaction_amount',
      dayCountBasis: 360,
      startAnchor: 'SHIPMENT_DAY',
      startOffsetDays: 0,
      endAnchor: 'FINAL_MATURITY_DAY',
      endOffsetDays: 0,
      minFeeFrequency: 'none',
      displayOrder: 10,
      active: true,
    },
  ],
  issuingBankFeeRules: [
    {
      id: 'opening-fee',
      issuingBankFeeRuleId: 'opening-fee',
      issuingBankId: '20000000-0000-0000-0000-000000000001',
      currency: 'USD',
      feeName: 'Opening Fee',
      chargeType: 'issuing_fee',
      payer: 'applicant',
      rateType: 'flat_pct',
      fixedRatePct: 2,
      amountBasis: 'transaction_amount',
      dayCountBasis: 360,
      startOffsetDays: 0,
      endOffsetDays: 0,
      minFeeFrequency: 'none',
      displayOrder: 100,
      active: true,
    },
  ],
  referenceRates: [
    {
      id: 'cof-usd',
      rateKey: 'COF',
      currency: 'USD',
      tenorDays: 360,
      ratePct: 4.2,
      rateDate: '2026-07-09',
      active: true,
    },
  ],
};
