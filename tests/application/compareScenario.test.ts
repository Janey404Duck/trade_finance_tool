import { describe, expect, it } from 'vitest';
import { compareScenario } from '@/lib/application/compareScenario';
import { quotation, referenceRates, standardTimeline } from '../fixtures';

describe('compareScenario', () => {
  it('orchestrates timeline, quotation selection, pricing, and cheapest-first output', () => {
    const expensive = quotation();
    const cheaper = quotation({
      id: 'quotation-2',
      reference: 'CITI-QT-2026-003',
      institution: {
        id: 'institution-citi',
        name: 'Citi',
        type: 'bank',
        active: true,
      },
      versions: [{
        ...quotation().versions[0],
        id: 'citi-v1',
        pricing: quotation().versions[0].pricing.map((record) =>
          record.id === 'discount-unconfirmed'
            ? {
                ...record,
                id: 'citi-discount-unconfirmed',
                rate: {
                  type: 'referencePlusSpread' as const,
                  referenceRateIndexId: 'cof',
                  spreadPct: 3,
                },
              }
            : { ...record, id: `citi-${record.id}` },
        ),
      }],
    });

    const result = compareScenario(
      {
        amount: 1_000_000,
        currency: 'USD',
        asOfDate: '2026-07-01',
        financing: {
          confirmationRequired: false,
          discounting: true,
          forfaiting: false,
        },
        timeline: standardTimeline,
      },
      { quotations: [expensive, cheaper], referenceRates },
    );

    expect(result.timeline.events.lcMaturity?.day).toBe(405);
    expect(result.results.map((item) => item.quotationReference)).toEqual([
      'CITI-QT-2026-003',
      'SCB-QT-2026-001',
    ]);
  });
});
