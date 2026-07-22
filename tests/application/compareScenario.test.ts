import { describe, expect, it } from 'vitest';
import { compareScenario } from '@/lib/application/compareScenario';
import { fee, quotation, referenceRates, standardTimeline } from '../fixtures';

describe('compareScenario', () => {
  it('compares multiple component combinations against the same transaction snapshot', () => {
    const result = compareScenario(
      {
        amount: 1_000_000,
        currency: 'USD',
        asOfDate: '2026-07-01',
        comparisonMode: 'coreFeesOnly',
        comparisonCases: [
          { id: 'confirmed', label: 'Confirmation + discounting', components: ['confirmation', 'discounting'] },
          { id: 'unconfirmed', label: 'Discounting only', components: ['discounting'] },
        ],
        timeline: standardTimeline,
      },
      { quotations: [quotation()], referenceRates },
    );
    expect(result.timeline.events.lcMaturity?.day).toBe(405);
    expect(result.results).toHaveLength(2);
    expect(result.results.map((item) => item.comparisonCaseId)).toEqual(['confirmed', 'unconfirmed']);
    expect(result.results.every((item) => item.eligible)).toBe(true);
  });

  it('keeps an unsupported quote/case pair visible as ineligible', () => {
    const confirmedOnly = quotation({
      versions: [{
        ...quotation().versions[0],
        pricing: quotation().versions[0].pricing.filter((record) => record.id !== 'discount-unconfirmed'),
      }],
    });
    const result = compareScenario(
      {
        amount: 1_000_000, currency: 'USD', asOfDate: '2026-07-01', comparisonMode: 'coreFeesOnly',
        comparisonCases: [{ id: 'unconfirmed', label: 'Discounting only', components: ['discounting'] }],
        timeline: standardTimeline,
      },
      { quotations: [confirmedOnly], referenceRates },
    );
    expect(result.results[0]).toMatchObject({ eligible: false, reasons: ['discounting pricing without confirmation'] });
  });

  it('uses institution schedules and quote pricing overrides without duplicating a fee', () => {
    const item = quotation();
    const result = compareScenario(
      {
        amount: 1_000_000, currency: 'USD', issuingInstitutionId: 'issuer-1', asOfDate: '2026-07-01',
        comparisonMode: 'allAvailableFees',
        comparisonCases: [{ id: 'confirmed', label: 'Confirmation', components: ['confirmation'] }],
        timeline: standardTimeline,
      },
      {
        quotations: [item], referenceRates,
        institutionFeeSchedules: [{
          id: 'issuer-schedule',
          institution: { id: 'issuer-1', name: 'Issuer Bank', type: 'bank', active: true },
          currency: 'USD', role: 'issuingBank', status: 'active', validFrom: '2026-01-01',
          pricing: [fee({
            id: 'issuer-fee', feeCode: 'issuing-standard', label: 'Issuing fee', kind: 'issuingFee',
            chargedByInstitutionId: 'issuer-1', chargedByRole: 'issuingBank', rate: { type: 'fixedAmount', amount: 300 },
          })],
        }],
      },
    );
    const eligible = result.results[0];
    expect(eligible.eligible).toBe(true);
    if (eligible.eligible) {
      expect(eligible.lines.find((line) => line.kind === 'issuingFee')).toMatchObject({ source: 'institutionSchedule', finalCost: 300 });
    }
  });

  it('applies a confirming-bank SWIFT fee only to a case containing confirmation', () => {
    const item = quotation({
      versions: [{
        ...quotation().versions[0],
        pricing: [...quotation().versions[0].pricing, fee({
          id: 'confirming-swift', label: 'Confirming SWIFT', kind: 'swiftFee',
          requiredComponents: ['confirmation'], rate: { type: 'fixedAmount', amount: 50 },
        })],
      }],
    });
    const result = compareScenario(
      {
        amount: 1_000_000, currency: 'USD', asOfDate: '2026-07-01', comparisonMode: 'allAvailableFees',
        comparisonCases: [
          { id: 'confirmed', label: 'Confirmed discounting', components: ['confirmation', 'discounting'] },
          { id: 'plain', label: 'Discounting only', components: ['discounting'] },
        ], timeline: standardTimeline,
      },
      { quotations: [item], referenceRates },
    );
    const costs = result.results.filter((entry) => entry.eligible);
    expect(costs[0].eligible && costs[0].lines.some((line) => line.pricingRecordId === 'confirming-swift')).toBe(true);
    expect(costs[1].eligible && costs[1].lines.some((line) => line.pricingRecordId === 'confirming-swift')).toBe(false);
  });
});
