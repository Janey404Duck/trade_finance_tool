import { describe, expect, it } from 'vitest';
import {
  calculateQuotationCost,
  resolveTermRateTenorMonths,
} from '@/lib/domain/cost/calculateQuotationCost';
import { resolveTimeline } from '@/lib/domain/timeline/resolveTimeline';
import type { ComparisonCase } from '@/lib/domain/financing/model';
import { fee, quotation, referenceRates, standardTimeline } from '../fixtures';

const confirmedDiscounting: ComparisonCase = {
  id: 'confirmed-discounting',
  label: 'Confirmation + discounting',
  components: ['confirmation', 'discounting'],
};
const discountingOnly: ComparisonCase = {
  id: 'discounting-only',
  label: 'Discounting only',
  components: ['discounting'],
};

function context(comparisonCase: ComparisonCase = { ...discountingOnly, components: [...discountingOnly.components] }) {
  return {
    amount: 1_000_000,
    currency: 'USD',
    comparisonCase,
    comparisonMode: 'coreFeesOnly' as const,
    timeline: resolveTimeline(standardTimeline),
    referenceRates,
  };
}

describe('calculateQuotationCost', () => {
  it('aggregates confirmation and discounting in one transaction result', () => {
    const item = quotation();
    const result = calculateQuotationCost(item, item.versions[0], context(confirmedDiscounting));
    expect(result.lines.map((line) => line.pricingRecordId)).toEqual([
      'confirmation',
      'discount-confirmed',
    ]);
    expect(result.confirmationCost).toBeCloseTo(9_250, 6);
    expect(result.financingCost).toBeCloseTo(42_769.444444, 6);
    expect(result.totalCost).toBeCloseTo(52_019.444444, 6);
  });

  it('uses only the explicitly applicable unconfirmed discounting record', () => {
    const item = quotation();
    const result = calculateQuotationCost(item, item.versions[0], context());
    expect(result.lines.map((line) => line.pricingRecordId)).toEqual(['discount-unconfirmed']);
    expect(result.confirmationCost).toBe(0);
    expect(result.lines[0].referenceRate).toMatchObject({ tenorMonths: 12, ratePct: 3.85 });
  });

  it('rejects a quote that only discloses confirmed discounting for an unconfirmed case', () => {
    const item = quotation({
      versions: [{
        ...quotation().versions[0],
        id: 'confirmed-only',
        pricing: quotation().versions[0].pricing.filter((record) => record.id !== 'discount-unconfirmed'),
      }],
    });
    expect(() => calculateQuotationCost(item, item.versions[0], context())).toThrow(
      'missing discounting pricing without confirmation',
    );
  });

  it('maps financing periods to supported term tenors', () => {
    expect(resolveTermRateTenorMonths(30)).toBe(1);
    expect(resolveTermRateTenorMonths(31)).toBe(3);
    expect(resolveTermRateTenorMonths(91)).toBe(6);
    expect(resolveTermRateTenorMonths(181)).toBe(12);
    expect(() => resolveTermRateTenorMonths(361)).toThrow('No supported term-rate tenor');
  });

  it('uses SHIBOR and the period-selected tenor for CNY forfaiting', () => {
    const item = quotation({
      currency: 'CNY',
      versions: [{
        ...quotation().versions[0],
        id: 'cny-forfaiting',
        pricing: [fee({
          id: 'forfaiting-shibor',
          label: 'CNY forfaiting',
          kind: 'forfaiting',
          chargedByRole: 'financingProvider',
          requiredComponents: ['forfaiting'],
          rate: { type: 'referencePlusSpread', referenceRateFamily: 'TERM_SHIBOR', spreadPct: 1.25 },
          startEvent: 'supplierPayment',
          endEvent: 'lcMaturity',
          dayCountConvention: 'ACT/360',
        })],
      }],
    });
    const timeline = resolveTimeline({
      tradeStartDate: '2026-01-01',
      events: [
        { event: 'supplierPayment', mode: 'relative', anchor: 'tradeStart', offsetDays: 10 },
        { event: 'lcMaturity', mode: 'relative', anchor: 'supplierPayment', offsetDays: 150 },
      ],
    });
    const result = calculateQuotationCost(item, item.versions[0], {
      amount: 1_000_000,
      currency: 'CNY',
      comparisonCase: { id: 'forfaiting', label: 'Forfaiting', components: ['forfaiting'] },
      comparisonMode: 'coreFeesOnly',
      timeline,
      referenceRates,
    });
    expect(result.lines[0].referenceRate).toMatchObject({ family: 'TERM_SHIBOR', tenorMonths: 6 });
  });

  it('supports confirmation-to-acceptance plus deferred-payment-to-maturity', () => {
    const item = quotation({
      versions: [{
        ...quotation().versions[0],
        id: 'split-confirmation',
        pricing: [
          fee({
            id: 'confirmation-to-acceptance', label: 'Confirmation until acceptance', kind: 'confirmationFee',
            requiredComponents: ['confirmation'], rate: { type: 'annualizedPercentage', ratePct: 0.9 },
            startEvent: 'lcIssuance', endEvent: 'acceptance', dayCountConvention: 'ACT/360',
          }),
          fee({
            id: 'deferred-to-maturity', label: 'Deferred payment fee', kind: 'deferredPaymentFee',
            requiredComponents: ['confirmation'], rate: { type: 'annualizedPercentage', ratePct: 0.7 },
            startEvent: 'acceptance', endEvent: 'lcMaturity', dayCountConvention: 'ACT/360',
          }),
        ],
      }],
    });
    const result = calculateQuotationCost(item, item.versions[0], {
      ...context(),
      comparisonCase: { id: 'confirmation', label: 'Confirmation', components: ['confirmation'] },
    });
    expect(result.lines).toEqual([
      expect.objectContaining({ pricingRecordId: 'confirmation-to-acceptance', chargeDays: 22 }),
      expect.objectContaining({ pricingRecordId: 'deferred-to-maturity', chargeDays: 348 }),
    ]);
  });

  it('treats negotiation as admin and includes conditional admin fees only when selected', () => {
    const item = quotation({
      versions: [{
        ...quotation().versions[0],
        pricing: [
          ...quotation().versions[0].pricing,
          fee({
            id: 'amendment', label: 'Confirming bank amendment', kind: 'amendmentFee',
            inclusionMode: 'conditional', requiredComponents: ['confirmation'], rate: { type: 'fixedAmount', amount: 75 },
          }),
          fee({
            id: 'discrepancy', label: 'Discrepancy', kind: 'discrepancyFee',
            inclusionMode: 'conditional', rate: { type: 'fixedAmount', amount: 125 },
          }),
        ],
      }],
    });
    const core = calculateQuotationCost(item, item.versions[0], context(confirmedDiscounting));
    const all = calculateQuotationCost(item, item.versions[0], {
      ...context(confirmedDiscounting),
      comparisonMode: 'allAvailableFees',
      includedConditionalFeeKinds: ['amendmentFee'],
    });
    expect(core.lines.some((line) => line.kind === 'negotiationFee')).toBe(false);
    expect(all.lines.some((line) => line.kind === 'negotiationFee')).toBe(true);
    expect(all.lines.some((line) => line.kind === 'amendmentFee')).toBe(true);
    expect(all.lines.some((line) => line.kind === 'discrepancyFee')).toBe(false);
    expect(all.administrativeCost).toBe(825);
  });

  it('reports missing admin disclosures without treating them as zero', () => {
    const item = quotation();
    const result = calculateQuotationCost(item, item.versions[0], {
      ...context(),
      comparisonMode: 'allAvailableFees',
      expectedAdministrativeFeeSlots: [
        { feeCode: 'advisingFee', kind: 'advisingFee', chargedByRole: 'advisingBank' },
        { feeCode: 'confirming-swift', kind: 'swiftFee', chargedByRole: 'confirmingBank' },
      ],
    });
    expect(result.coverageStatus).toBe('incomplete');
    expect(result.missingAdministrativeFeeSlots).toEqual([
      { feeCode: 'confirming-swift', kind: 'swiftFee', chargedByRole: 'confirmingBank' },
    ]);
  });

  it('shows an explicitly waived fee as a complete zero-cost disclosure', () => {
    const item = quotation({
      versions: [{
        ...quotation().versions[0],
        pricing: [...quotation().versions[0].pricing, fee({
          id: 'swift-waived', label: 'SWIFT waived', kind: 'swiftFee',
          disclosureStatus: 'waived', rate: { type: 'fixedAmount', amount: 75 },
        })],
      }],
    });
    const result = calculateQuotationCost(item, item.versions[0], {
      ...context(), comparisonMode: 'allAvailableFees',
      expectedAdministrativeFeeSlots: [{ feeCode: 'swiftFee', kind: 'swiftFee', chargedByRole: 'confirmingBank' }],
    });
    expect(result.coverageStatus).toBe('complete');
    expect(result.lines.find((line) => line.kind === 'swiftFee')).toMatchObject({
      finalCost: 0,
      disclosureStatus: 'waived',
      rate: { type: 'fixedAmount', amount: 75 },
    });
  });
});
