import { describe, expect, it } from 'vitest';
import { calculateChargeRule } from '@/lib/calc/calculateChargeRule';
import { resolveAnchorDays } from '@/lib/calc/resolveAnchorDay';
import type { CalculateInput, ChargeRule, ReferenceRate } from '@/lib/calc/types';

const input: CalculateInput = {
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

const referenceRates: ReferenceRate[] = [
  {
    id: 'rate-1',
    rateKey: 'COF',
    currency: 'USD',
    tenorDays: 360,
    ratePct: 4.2,
    rateDate: '2026-07-09',
    active: true,
  },
];

describe('calculateChargeRule', () => {
  it('calculates annual percentage fees', () => {
    const rule = baseRule({
      rateType: 'annual_pct',
      fixedRatePct: 0.8,
      startAnchor: 'LC_ISSUE_DAY',
      endAnchor: 'FINAL_MATURITY_DAY',
      endOffsetDays: -30,
    });

    const line = calculateChargeRule({
      rule,
      input,
      anchorDays: resolveAnchorDays(input),
      referenceRates,
      sourceType: 'quote_charge_rule',
    });

    expect(line.chargeDays).toBe(360);
    expect(line.calculatedFee).toBeCloseTo(8_000, 6);
    expect(line.finalFee).toBeCloseTo(8_000, 6);
  });

  it('calculates discounting from discount start to revised final maturity', () => {
    const rule = baseRule({
      rateType: 'base_plus_spread',
      baseRateKey: 'COF',
      spreadPct: 0.2,
      startAnchor: 'DISCOUNT_START_DAY',
      endAnchor: 'FINAL_MATURITY_DAY',
    });

    const line = calculateChargeRule({
      rule,
      input,
      anchorDays: resolveAnchorDays(input),
      referenceRates,
      sourceType: 'quote_charge_rule',
    });

    expect(line.startDay).toBe(120);
    expect(line.endDay).toBe(390);
    expect(line.chargeDays).toBe(270);
    expect(line.baseRatePct).toBe(4.2);
    expect(line.effectiveRatePct).toBeCloseTo(4.4, 6);
    expect(line.finalFee).toBeCloseTo(33_000, 6);
  });

  it('calculates flat percentage fees', () => {
    const rule = baseRule({
      rateType: 'flat_pct',
      fixedRatePct: 2,
    });

    const line = calculateChargeRule({
      rule,
      input,
      anchorDays: resolveAnchorDays(input),
      referenceRates,
      sourceType: 'issuing_bank_fee_rule',
    });

    expect(line.chargeDays).toBeNull();
    expect(line.finalFee).toBeCloseTo(20_000, 6);
  });

  it('applies monthly minimum fees', () => {
    const rule = baseRule({
      rateType: 'annual_pct',
      fixedRatePct: 0.4,
      startAnchor: 'LC_ISSUE_DAY',
      endAnchor: 'LC_ISSUE_DAY',
      endOffsetDays: 45,
      minFeeAmount: 1_000,
      minFeeFrequency: 'month',
    });

    const line = calculateChargeRule({
      rule,
      input,
      anchorDays: resolveAnchorDays(input),
      referenceRates,
      sourceType: 'quote_charge_rule',
    });

    expect(line.calculatedFee).toBeCloseTo(500, 6);
    expect(line.finalFee).toBe(2_000);
  });

  it('rejects negative charge days', () => {
    const rule = baseRule({
      rateType: 'annual_pct',
      fixedRatePct: 1,
      startAnchor: 'FINAL_MATURITY_DAY',
      endAnchor: 'SHIPMENT_DAY',
    });

    expect(() =>
      calculateChargeRule({
        rule,
        input,
        anchorDays: resolveAnchorDays(input),
        referenceRates,
        sourceType: 'quote_charge_rule',
      }),
    ).toThrow(/negative charge days/);
  });
});

function baseRule(overrides: Partial<ChargeRule>): ChargeRule {
  return {
    id: 'rule-1',
    quoteComponentId: 'component-1',
    chargeType: 'DISCOUNTING_FEE',
    payer: 'applicant',
    rateType: 'annual_pct',
    amountBasis: 'transaction_amount',
    dayCountBasis: 360,
    startOffsetDays: 0,
    endOffsetDays: 0,
    minFeeFrequency: 'none',
    displayOrder: 1,
    ...overrides,
  };
}
