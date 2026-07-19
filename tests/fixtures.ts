import type { Quotation } from '@/lib/domain/quotation/model';
import type { TradeTimeline } from '@/lib/domain/timeline/model';

export const standardTimeline: TradeTimeline = {
  tradeStartDate: '2026-01-01',
  events: [
    { event: 'shipment', mode: 'relative', anchor: 'tradeStart', offsetDays: 45 },
    { event: 'lcIssuance', mode: 'relative', anchor: 'shipment', offsetDays: -10 },
    { event: 'presentation', mode: 'relative', anchor: 'shipment', offsetDays: 7 },
    { event: 'acceptance', mode: 'relative', anchor: 'presentation', offsetDays: 5 },
    { event: 'supplierPayment', mode: 'relative', anchor: 'acceptance', offsetDays: 2 },
    { event: 'lcMaturity', mode: 'relative', anchor: 'shipment', offsetDays: 360 },
  ],
};

export function quotation(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: 'quotation-1',
    reference: 'SCB-QT-2026-001',
    institution: {
      id: 'institution-scb',
      name: 'Standard Chartered',
      type: 'bank',
      active: true,
    },
    currency: 'USD',
    productType: 'lcFinancing',
    tenorDays: 400,
    issuingInstitutionIds: [],
    versions: [
      {
        id: 'version-1',
        version: 1,
        status: 'active',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        pricing: [
          {
            id: 'instrument',
            label: 'Advising fee',
            kind: 'instrumentFee',
            condition: 'always',
            rate: { type: 'fixedAmount', amount: 500 },
          },
          {
            id: 'confirmation',
            label: 'Confirmation fee',
            kind: 'confirmationFee',
            condition: 'confirmationRequired',
            rate: { type: 'annualizedPercentage', ratePct: 0.9 },
            startEvent: 'lcIssuance',
            endEvent: 'lcMaturity',
            dayCountConvention: 'ACT/360',
          },
          {
            id: 'discount-confirmed',
            label: 'Discounting with confirmation',
            kind: 'discounting',
            condition: 'confirmationRequired',
            rate: {
              type: 'referencePlusSpread',
              referenceRateIndexId: 'sofr-12m',
              spreadPct: 0.6,
            },
            startEvent: 'supplierPayment',
            endEvent: 'lcMaturity',
            dayCountConvention: 'ACT/360',
          },
          {
            id: 'discount-unconfirmed',
            label: 'Discounting without confirmation',
            kind: 'discounting',
            condition: 'confirmationNotRequired',
            rate: {
              type: 'referencePlusSpread',
              referenceRateIndexId: 'cof',
              spreadPct: 4,
            },
            startEvent: 'supplierPayment',
            endEvent: 'lcMaturity',
            dayCountConvention: 'ACT/360',
          },
        ],
      },
    ],
    ...overrides,
  };
}

export const referenceRates = [
  { indexId: 'sofr-12m', name: '12M Term SOFR', ratePct: 3.85, effectiveDate: '2026-01-01' },
  { indexId: 'cof', name: 'USD Cost of Funds', ratePct: 4.2, effectiveDate: '2026-01-01' },
];
