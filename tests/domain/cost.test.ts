import { describe, expect, it } from 'vitest';
import { calculateQuotationCost } from '@/lib/domain/cost/calculateQuotationCost';
import { resolveTimeline } from '@/lib/domain/timeline/resolveTimeline';
import { quotation, referenceRates, standardTimeline } from '../fixtures';

describe('calculateQuotationCost', () => {
  it('prices confirmation and confirmed discounting as independent cost lines', () => {
    const item = quotation();
    const result = calculateQuotationCost(item, item.versions[0], {
      amount: 1_000_000,
      currency: 'USD',
      financing: {
        confirmationRequired: true,
        discounting: true,
        forfaiting: false,
      },
      timeline: resolveTimeline(standardTimeline),
      referenceRates,
    });

    expect(result.lines.map((line) => line.pricingRecordId)).toEqual([
      'instrument',
      'confirmation',
      'discount-confirmed',
    ]);
    expect(result.confirmationCost).toBeCloseTo(9_250, 6);
    expect(result.financingCost).toBeCloseTo(42_769.444444, 6);
    expect(result.totalCost).toBeCloseTo(52_519.444444, 6);
  });

  it('uses the without-confirmation discounting price without adding confirmation cost', () => {
    const item = quotation();
    const result = calculateQuotationCost(item, item.versions[0], {
      amount: 1_000_000,
      currency: 'USD',
      financing: {
        confirmationRequired: false,
        discounting: true,
        forfaiting: false,
      },
      timeline: resolveTimeline(standardTimeline),
      referenceRates,
    });

    expect(result.lines.map((line) => line.pricingRecordId)).toEqual([
      'instrument',
      'discount-unconfirmed',
    ]);
    expect(result.confirmationCost).toBe(0);
    expect(result.financingCost).toBeCloseTo(78_811.111111, 6);
    expect(result.totalCost).toBeCloseTo(79_311.111111, 6);
  });

  it('rejects simultaneous discounting and forfaiting', () => {
    const item = quotation();
    expect(() =>
      calculateQuotationCost(item, item.versions[0], {
        amount: 1_000_000,
        currency: 'USD',
        financing: {
          confirmationRequired: false,
          discounting: true,
          forfaiting: true,
        },
        timeline: resolveTimeline(standardTimeline),
        referenceRates,
      }),
    ).toThrow('alternative early-payment');
  });

  it('applies 30/360 before minimum-period and billing-rounding rules', () => {
    const item = quotation({
      versions: [{
        id: 'thirty-360-version',
        version: 1,
        status: 'active',
        validFrom: '2026-01-01',
        pricing: [{
          id: 'thirty-360-fee',
          label: 'Quarterly confirmation',
          kind: 'confirmationFee',
          condition: 'confirmationRequired',
          rate: { type: 'annualizedPercentage', ratePct: 1 },
          startEvent: 'lcIssuance',
          endEvent: 'presentation',
          dayCountConvention: '30/360',
          billingFrequency: 'quarterly',
          partialPeriodRounding: 'up',
        }],
      }],
    });
    const result = calculateQuotationCost(item, item.versions[0], {
      amount: 1_000_000,
      currency: 'USD',
      financing: {
        confirmationRequired: true,
        discounting: false,
        forfaiting: false,
      },
      timeline: resolveTimeline(standardTimeline),
      referenceRates,
    });

    expect(result.lines[0].chargeDays).toBe(90);
    expect(result.totalCost).toBe(2_500);
  });
});
