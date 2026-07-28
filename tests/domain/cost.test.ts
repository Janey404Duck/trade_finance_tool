import { describe, expect, it } from 'vitest';
import { calculateFeeLine, resolveTermRateTenorMonths } from '@/lib/domain/cost/calculateFeeLine';
import { calculateIssuingQuotationCost } from '@/lib/domain/cost/calculateIssuingQuotationCost';
import { calculateNonIssuingQuotationCost } from '@/lib/domain/cost/calculateNonIssuingQuotationCost';
import { resolveTimeline } from '@/lib/domain/timeline/resolveTimeline';
import {
  issuingFee,
  issuingQuotation,
  nonIssuingFee,
  nonIssuingQuotation,
  referenceRates,
  standardTimeline,
} from '../fixtures';

const feeContext = {
  amount: 1_000_000,
  currency: 'USD',
  timeline: resolveTimeline(standardTimeline),
  referenceRates,
};

describe('quote-only cost calculators', () => {
  it('includes only issuing fee in core mode and SWIFT in all-fees mode', () => {
    const quote = issuingQuotation();
    const core = calculateIssuingQuotationCost(quote, quote.versions[0], 'coreFeesOnly', feeContext);
    const all = calculateIssuingQuotationCost(quote, quote.versions[0], 'allAvailableFees', feeContext);
    expect(core.lines.map((line) => line.kind)).toEqual(['issuingFee']);
    expect(all.lines.map((line) => line.kind)).toEqual(['issuingFee', 'swiftFee']);
    expect(all.administrativeCost).toBe(60);
  });

  it('aggregates confirmation and confirmed discounting for one fixed solution', () => {
    const quote = nonIssuingQuotation();
    const result = calculateNonIssuingQuotationCost(
      quote, quote.versions[0], 'confirmationWithDiscounting', 'coreFeesOnly', feeContext,
    );
    expect(result.lines.map((line) => line.feeRecordId)).toEqual([
      'confirmation', 'discount-confirmed',
    ]);
    expect(result.confirmationCost).toBeCloseTo(9_250, 6);
    expect(result.financingCost).toBeCloseTo(42_769.444444, 6);
  });

  it('does not reuse confirmed discounting for discounting-only', () => {
    const quote = nonIssuingQuotation();
    const result = calculateNonIssuingQuotationCost(
      quote, quote.versions[0], 'discountingOnly', 'coreFeesOnly', feeContext,
    );
    expect(result.lines.map((line) => line.feeRecordId)).toEqual(['discount-unconfirmed']);
    expect(result.lines[0].referenceRate).toMatchObject({ tenorMonths: 12, ratePct: 3.85 });
  });

  it('selects distinct confirmed and unconfirmed forfaiting records', () => {
    const quote = nonIssuingQuotation();
    const plain = calculateNonIssuingQuotationCost(
      quote, quote.versions[0], 'forfaitingOnly', 'coreFeesOnly', feeContext,
    );
    const confirmed = calculateNonIssuingQuotationCost(
      quote, quote.versions[0], 'confirmationWithForfaiting', 'coreFeesOnly', feeContext,
    );
    expect(plain.lines.map((line) => line.feeRecordId)).toEqual(['forfaiting-unconfirmed']);
    expect(confirmed.lines.map((line) => line.feeRecordId)).toEqual([
      'confirmation', 'forfaiting-confirmed',
    ]);
  });

  it('includes every applicable admin fee automatically only in all-fees mode', () => {
    const quote = nonIssuingQuotation();
    const core = calculateNonIssuingQuotationCost(
      quote, quote.versions[0], 'discountingOnly', 'coreFeesOnly', feeContext,
    );
    const all = calculateNonIssuingQuotationCost(
      quote, quote.versions[0], 'discountingOnly', 'allAvailableFees', feeContext,
    );
    expect(core.lines.every((line) => ['discounting'].includes(line.kind))).toBe(true);
    expect(all.lines.map((line) => line.kind)).toEqual([
      'discounting', 'advisingFee', 'swiftFee', 'handlingFee', 'negotiationFee',
    ]);
    expect(all.lines.find((line) => line.kind === 'handlingFee')).toMatchObject({
      disclosureStatus: 'waived', finalCost: 0,
    });
  });

  it('supports confirmation until acceptance plus deferred payment to maturity', () => {
    const quote = nonIssuingQuotation({
      versions: [{
        ...nonIssuingQuotation().versions[0],
        pricing: [
          nonIssuingFee({
            id: 'confirmation-split', label: 'Confirmation until acceptance', kind: 'confirmationFee',
            applicableSolutions: ['confirmationOnly'],
            rate: { type: 'annualizedPercentage', ratePct: 0.9 },
            startEvent: 'lcIssuance', endEvent: 'acceptance', dayCountConvention: 'ACT/360',
          }),
          nonIssuingFee({
            id: 'deferred', label: 'Deferred payment', kind: 'deferredPaymentFee',
            applicableSolutions: ['confirmationOnly'],
            rate: { type: 'annualizedPercentage', ratePct: 0.7 },
            startEvent: 'acceptance', endEvent: 'lcMaturity', dayCountConvention: 'ACT/360',
          }),
        ],
      }],
    });
    const result = calculateNonIssuingQuotationCost(
      quote, quote.versions[0], 'confirmationOnly', 'coreFeesOnly', feeContext,
    );
    expect(result.lines).toEqual([
      expect.objectContaining({ feeRecordId: 'confirmation-split', chargeDays: 22 }),
      expect.objectContaining({ feeRecordId: 'deferred', chargeDays: 348 }),
    ]);
  });

  it('uses SHIBOR and the period-selected tenor for CNY financing', () => {
    const timeline = resolveTimeline({
      tradeStartDate: '2026-01-01',
      events: [
        { event: 'supplierPayment', mode: 'relative', anchor: 'tradeStart', offsetDays: 10 },
        { event: 'lcMaturity', mode: 'relative', anchor: 'supplierPayment', offsetDays: 150 },
      ],
    });
    const line = calculateFeeLine(nonIssuingFee({
      id: 'cny-forfaiting', label: 'CNY forfaiting', kind: 'forfaiting',
      applicableSolutions: ['forfaitingOnly'],
      rate: { type: 'referencePlusSpread', referenceRateFamily: 'TERM_SHIBOR', spreadPct: 1.25 },
      startEvent: 'supplierPayment', endEvent: 'lcMaturity', dayCountConvention: 'ACT/360',
    }), { ...feeContext, currency: 'CNY', timeline }, {
      quotationSide: 'nonIssuingBank', quotationId: 'q', quotationVersionId: 'v',
      institutionId: 'i', institutionName: 'Bank',
    });
    expect(line.referenceRate).toMatchObject({ family: 'TERM_SHIBOR', tenorMonths: 6 });
  });

  it('enforces fee disclosure and term-rate invariants', () => {
    expect(() => calculateFeeLine(issuingFee({
      id: 'bad-waiver', label: 'Bad waiver', kind: 'swiftFee',
      disclosureStatus: 'waived', rate: { type: 'fixedAmount', amount: 10 },
    }), feeContext, {
      quotationSide: 'issuingBank', quotationId: 'q', quotationVersionId: 'v',
      institutionId: 'i', institutionName: 'Bank',
    })).toThrow('cannot have a rate');
  });

  it('maps periods to 1M, 3M, 6M, and 12M term tenors', () => {
    expect(resolveTermRateTenorMonths(30)).toBe(1);
    expect(resolveTermRateTenorMonths(31)).toBe(3);
    expect(resolveTermRateTenorMonths(91)).toBe(6);
    expect(resolveTermRateTenorMonths(181)).toBe(12);
    expect(() => resolveTermRateTenorMonths(361)).toThrow('No supported term-rate tenor');
  });
});
