import { describe, expect, it } from 'vitest';
import { calculateScenario } from '@/lib/calc/calculateScenario';
import { resolveAnchorDays } from '@/lib/calc/resolveAnchorDay';
import type { CalculateInput, ScenarioData } from '@/lib/calc/types';

const baseInput: CalculateInput = {
  issuingBankId: '20000000-0000-0000-0000-000000000001',
  currency: 'USD',
  transactionAmount: 1_000_000,
  shipmentDaysAfterLcIssue: 30,
  maturityBasis: 'AFTER_SHIPMENT',
  maturityDays: 360,
  selectedPaths: ['CONFIRMATION'],
  confirmationOptions: {
    includeDiscounting: true,
    discountStartDaysAfterShipment: 90,
  },
};

describe('resolveAnchorDays', () => {
  it('resolves maturity after shipment', () => {
    expect(resolveAnchorDays(baseInput)).toEqual({
      LC_ISSUE_DAY: 0,
      SHIPMENT_DAY: 30,
      DISCOUNT_START_DAY: 120,
      FINAL_MATURITY_DAY: 390,
    });
  });

  it('resolves maturity after LC issuance', () => {
    expect(
      resolveAnchorDays({
        ...baseInput,
        maturityBasis: 'AFTER_LC_ISSUANCE',
      }),
    ).toEqual({
      LC_ISSUE_DAY: 0,
      SHIPMENT_DAY: 30,
      DISCOUNT_START_DAY: 120,
      FINAL_MATURITY_DAY: 360,
    });
  });

  it('rejects final maturity before shipment day', () => {
    expect(() =>
      resolveAnchorDays({
        ...baseInput,
        maturityBasis: 'AFTER_LC_ISSUANCE',
        maturityDays: 20,
      }),
    ).toThrow(/Final maturity day cannot be before shipment day/);
  });
});

describe('calculateScenario', () => {
  it('calculates confirmation with discounting and excludes forfaiting from that path', () => {
    const result = calculateScenario(baseInput, scenarioData, new Date('2026-07-09T12:00:00Z'));
    const natixis = result.results.find(
      (row) => row.quotePackageId === 'package-natixis' && row.solutionPath === 'CONFIRMATION',
    );

    expect(natixis?.eligible).toBe(true);
    expect(natixis?.includesDiscounting).toBe(true);
    expect(natixis?.confirmationCost).toBeCloseTo(666.6667, 4);
    expect(natixis?.deferredCost).toBeCloseTo(8_000, 6);
    expect(natixis?.discountingCost).toBeCloseTo(33_000, 6);
    expect(natixis?.forfaitingCost).toBe(0);
    expect(natixis?.issuingBankCost).toBe(20_000);
    expect(natixis?.totalCost).toBeCloseTo(61_666.6667, 4);
    expect(natixis?.lines.map((line) => line.componentType)).toEqual([
      'CONFIRMATION',
      'DEFERRED',
      'DISCOUNTING',
      undefined,
    ]);
  });

  it('excludes discounting when confirmation path opts out', () => {
    const result = calculateScenario(
      {
        ...baseInput,
        confirmationOptions: {
          includeDiscounting: false,
        },
      },
      scenarioData,
      new Date('2026-07-09T12:00:00Z'),
    );
    const natixis = result.results.find(
      (row) => row.quotePackageId === 'package-natixis' && row.solutionPath === 'CONFIRMATION',
    );

    expect(natixis?.includesDiscounting).toBe(false);
    expect(natixis?.discountingCost).toBe(0);
    expect(natixis?.lines.some((line) => line.componentType === 'DISCOUNTING')).toBe(false);
    expect(natixis?.forfaitingCost).toBe(0);
  });

  it('does not treat discounting as standalone under forfaiting path', () => {
    const result = calculateScenario(
      {
        ...baseInput,
        selectedPaths: ['FORFAITING'],
        confirmationOptions: {
          includeDiscounting: true,
          discountStartDaysAfterShipment: 90,
        },
      },
      scenarioData,
      new Date('2026-07-09T12:00:00Z'),
    );
    const natixis = result.results.find(
      (row) => row.quotePackageId === 'package-natixis' && row.solutionPath === 'FORFAITING',
    );

    expect(natixis?.discountingCost).toBe(0);
    expect(natixis?.forfaitingCost).toBe(40_000);
    expect(natixis?.lines.some((line) => line.componentType === 'DISCOUNTING')).toBe(false);
  });

  it('returns separate rows when both paths are selected', () => {
    const result = calculateScenario(
      {
        ...baseInput,
        selectedPaths: ['CONFIRMATION', 'FORFAITING'],
      },
      scenarioData,
      new Date('2026-07-09T12:00:00Z'),
    );
    const natixisRows = result.results.filter((row) => row.quotePackageId === 'package-natixis');

    expect(natixisRows).toHaveLength(2);
    expect(natixisRows.map((row) => row.solutionPath).sort()).toEqual([
      'CONFIRMATION',
      'FORFAITING',
    ]);
  });

  it('uses revised final maturity for discounting after LC issuance', () => {
    const result = calculateScenario(
      {
        ...baseInput,
        maturityBasis: 'AFTER_LC_ISSUANCE',
      },
      scenarioData,
      new Date('2026-07-09T12:00:00Z'),
    );
    const discountingLine = result.results
      .find(
        (row) => row.quotePackageId === 'package-natixis' && row.solutionPath === 'CONFIRMATION',
      )
      ?.lines.find((line) => line.componentType === 'DISCOUNTING');

    expect(discountingLine?.startDay).toBe(120);
    expect(discountingLine?.endDay).toBe(360);
    expect(discountingLine?.chargeDays).toBe(240);
  });

  it('filters quote packages by issuing bank eligibility', () => {
    const result = calculateScenario(baseInput, scenarioData, new Date('2026-07-09T12:00:00Z'));
    const restricted = result.results.find((row) => row.quotePackageId === 'package-restricted');

    expect(restricted?.eligible).toBe(false);
    expect(restricted?.ineligibilityReason).toMatch(/Issuing bank/);
  });
});

const scenarioData: ScenarioData = {
  quotePackages: [
    {
      id: 'package-natixis',
      institutionId: 'institution-natixis',
      institutionName: 'Natixis',
      packageName: 'Natixis USD Package',
      currency: 'USD',
      appliesToAllIssuingBanks: false,
      active: true,
    },
    {
      id: 'package-restricted',
      institutionId: 'institution-qnb',
      institutionName: 'QNB',
      packageName: 'QNB Restricted',
      currency: 'USD',
      appliesToAllIssuingBanks: false,
      active: true,
    },
  ],
  quotePackageIssuingBanks: [
    {
      quotePackageId: 'package-natixis',
      issuingBankId: '20000000-0000-0000-0000-000000000001',
    },
    {
      quotePackageId: 'package-restricted',
      issuingBankId: '20000000-0000-0000-0000-000000000002',
    },
  ],
  quoteComponents: [
    {
      id: 'component-natixis-confirmation',
      quotePackageId: 'package-natixis',
      componentType: 'CONFIRMATION',
      active: true,
    },
    {
      id: 'component-natixis-deferred',
      quotePackageId: 'package-natixis',
      componentType: 'DEFERRED',
      active: true,
    },
    {
      id: 'component-natixis-discounting',
      quotePackageId: 'package-natixis',
      componentType: 'DISCOUNTING',
      active: true,
    },
    {
      id: 'component-natixis-forfaiting',
      quotePackageId: 'package-natixis',
      componentType: 'FORFAITING',
      active: true,
    },
    {
      id: 'component-restricted-confirmation',
      quotePackageId: 'package-restricted',
      componentType: 'CONFIRMATION',
      active: true,
    },
  ],
  quoteChargeRules: [
    {
      id: 'natixis-confirmation',
      quoteComponentId: 'component-natixis-confirmation',
      chargeType: 'CONFIRMATION_FEE',
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
      quoteComponentId: 'component-natixis-deferred',
      chargeType: 'DEFERRED_PAYMENT_FEE',
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
      quoteComponentId: 'component-natixis-discounting',
      chargeType: 'DISCOUNTING_FEE',
      payer: 'applicant',
      rateType: 'base_plus_spread',
      baseRateKey: 'COF',
      spreadPct: 0.2,
      amountBasis: 'transaction_amount',
      dayCountBasis: 360,
      startAnchor: 'DISCOUNT_START_DAY',
      startOffsetDays: 0,
      endAnchor: 'FINAL_MATURITY_DAY',
      endOffsetDays: 0,
      minFeeFrequency: 'none',
      displayOrder: 30,
      active: true,
    },
    {
      id: 'natixis-forfaiting',
      quoteComponentId: 'component-natixis-forfaiting',
      chargeType: 'FORFAITING_FEE',
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
      displayOrder: 40,
      active: true,
    },
    {
      id: 'restricted-confirmation',
      quoteComponentId: 'component-restricted-confirmation',
      chargeType: 'CONFIRMATION_FEE',
      payer: 'applicant',
      rateType: 'annual_pct',
      fixedRatePct: 1,
      amountBasis: 'transaction_amount',
      dayCountBasis: 360,
      startAnchor: 'LC_ISSUE_DAY',
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
      chargeType: 'ISSUING_BANK_FEE',
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
