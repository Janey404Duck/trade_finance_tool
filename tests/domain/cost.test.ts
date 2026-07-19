import { describe, expect, it } from 'vitest';
import {
  calculateQuotationCost,
  resolveTermRateTenorMonths,
} from '@/lib/domain/cost/calculateQuotationCost';
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
    expect(result.lines[1].referenceRate).toMatchObject({
      family: 'TERM_SOFR',
      currency: 'USD',
      tenorMonths: 12,
      ratePct: 3.85,
    });
    expect(result.financingCost).toBeCloseTo(75_447.222222, 6);
    expect(result.totalCost).toBeCloseTo(75_947.222222, 6);
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

  it('rejects missing unconfirmed discounting pricing instead of treating it as zero', () => {
    const item = quotation({
      versions: [{
        id: 'confirmed-only',
        version: 1,
        status: 'active',
        validFrom: '2026-01-01',
        pricing: quotation().versions[0].pricing.filter(
          (record) => record.id !== 'discount-unconfirmed',
        ),
      }],
    });

    expect(() =>
      calculateQuotationCost(item, item.versions[0], {
        amount: 1_000_000,
        currency: 'USD',
        financing: {
          confirmationRequired: false,
          discounting: true,
          forfaiting: false,
        },
        timeline: resolveTimeline(standardTimeline),
        referenceRates,
      }),
    ).toThrow('missing discounting pricing without confirmation');
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

  it('maps financing periods to 1M, 3M, 6M, and 12M term tenors', () => {
    expect(resolveTermRateTenorMonths(30)).toBe(1);
    expect(resolveTermRateTenorMonths(31)).toBe(3);
    expect(resolveTermRateTenorMonths(90)).toBe(3);
    expect(resolveTermRateTenorMonths(91)).toBe(6);
    expect(resolveTermRateTenorMonths(180)).toBe(6);
    expect(resolveTermRateTenorMonths(181)).toBe(12);
    expect(resolveTermRateTenorMonths(360)).toBe(12);
    expect(() => resolveTermRateTenorMonths(361)).toThrow(
      'No supported term-rate tenor',
    );
  });

  it('selects SHIBOR by CNY currency and a 6M tenor for forfaiting', () => {
    const item = quotation({
      currency: 'CNY',
      versions: [{
        id: 'cny-forfaiting',
        version: 1,
        status: 'active',
        validFrom: '2026-01-01',
        pricing: [{
          id: 'forfaiting-shibor',
          label: 'CNY forfaiting',
          kind: 'forfaiting',
          condition: 'confirmationNotRequired',
          rate: {
            type: 'referencePlusSpread',
            referenceRateFamily: 'TERM_SHIBOR',
            spreadPct: 1.25,
          },
          startEvent: 'supplierPayment',
          endEvent: 'lcMaturity',
          dayCountConvention: 'ACT/360',
        }],
      }],
    });
    const timeline = resolveTimeline({
      tradeStartDate: '2026-01-01',
      events: [
        {
          event: 'supplierPayment',
          mode: 'relative',
          anchor: 'tradeStart',
          offsetDays: 10,
        },
        {
          event: 'lcMaturity',
          mode: 'relative',
          anchor: 'supplierPayment',
          offsetDays: 150,
        },
      ],
    });

    const result = calculateQuotationCost(item, item.versions[0], {
      amount: 1_000_000,
      currency: 'CNY',
      financing: {
        confirmationRequired: false,
        discounting: false,
        forfaiting: true,
      },
      timeline,
      referenceRates,
    });

    expect(result.lines[0].referenceRate).toMatchObject({
      name: '6M SHIBOR',
      family: 'TERM_SHIBOR',
      currency: 'CNY',
      tenorMonths: 6,
      ratePct: 1.65,
    });
    expect(result.lines[0].effectiveRatePct).toBe(2.9);
  });

  it('rejects a benchmark family that does not match the quotation currency', () => {
    const item = quotation({
      currency: 'CNY',
      versions: [{
        id: 'wrong-family',
        version: 1,
        status: 'active',
        validFrom: '2026-01-01',
        pricing: [{
          id: 'wrong-family-discount',
          label: 'Wrong benchmark',
          kind: 'discounting',
          condition: 'confirmationNotRequired',
          rate: {
            type: 'referencePlusSpread',
            referenceRateFamily: 'TERM_SOFR',
            spreadPct: 1,
          },
          startEvent: 'supplierPayment',
          endEvent: 'lcMaturity',
          dayCountConvention: 'ACT/360',
        }],
      }],
    });

    expect(() =>
      calculateQuotationCost(item, item.versions[0], {
        amount: 1_000_000,
        currency: 'CNY',
        financing: {
          confirmationRequired: false,
          discounting: true,
          forfaiting: false,
        },
        timeline: resolveTimeline(standardTimeline),
        referenceRates,
      }),
    ).toThrow('expected TERM_SHIBOR');
  });

  it('rejects fixed-rate discounting because financing must use a term benchmark', () => {
    const item = quotation({
      versions: [{
        id: 'fixed-discounting',
        version: 1,
        status: 'active',
        validFrom: '2026-01-01',
        pricing: [{
          id: 'fixed-discount',
          label: 'Fixed discounting',
          kind: 'discounting',
          condition: 'confirmationNotRequired',
          rate: { type: 'annualizedPercentage', ratePct: 5 },
          startEvent: 'supplierPayment',
          endEvent: 'lcMaturity',
          dayCountConvention: 'ACT/360',
        }],
      }],
    });

    expect(() =>
      calculateQuotationCost(item, item.versions[0], {
        amount: 1_000_000,
        currency: 'USD',
        financing: {
          confirmationRequired: false,
          discounting: true,
          forfaiting: false,
        },
        timeline: resolveTimeline(standardTimeline),
        referenceRates,
      }),
    ).toThrow('missing discounting pricing without confirmation');
  });
});
