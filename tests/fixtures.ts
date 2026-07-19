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
              referenceRateFamily: 'TERM_SOFR',
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
              referenceRateFamily: 'TERM_SOFR',
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
  { indexId: 'sofr-1m', name: '1M Term SOFR', family: 'TERM_SOFR' as const, currency: 'USD', tenorMonths: 1 as const, ratePct: 4.15, effectiveDate: '2026-01-01' },
  { indexId: 'sofr-3m', name: '3M Term SOFR', family: 'TERM_SOFR' as const, currency: 'USD', tenorMonths: 3 as const, ratePct: 4.10, effectiveDate: '2026-01-01' },
  { indexId: 'sofr-6m', name: '6M Term SOFR', family: 'TERM_SOFR' as const, currency: 'USD', tenorMonths: 6 as const, ratePct: 4.00, effectiveDate: '2026-01-01' },
  { indexId: 'sofr-12m', name: '12M Term SOFR', family: 'TERM_SOFR' as const, currency: 'USD', tenorMonths: 12 as const, ratePct: 3.85, effectiveDate: '2026-01-01' },
  { indexId: 'shibor-1m', name: '1M SHIBOR', family: 'TERM_SHIBOR' as const, currency: 'CNY', tenorMonths: 1 as const, ratePct: 1.55, effectiveDate: '2026-01-01' },
  { indexId: 'shibor-3m', name: '3M SHIBOR', family: 'TERM_SHIBOR' as const, currency: 'CNY', tenorMonths: 3 as const, ratePct: 1.60, effectiveDate: '2026-01-01' },
  { indexId: 'shibor-6m', name: '6M SHIBOR', family: 'TERM_SHIBOR' as const, currency: 'CNY', tenorMonths: 6 as const, ratePct: 1.65, effectiveDate: '2026-01-01' },
  { indexId: 'shibor-12m', name: '12M SHIBOR', family: 'TERM_SHIBOR' as const, currency: 'CNY', tenorMonths: 12 as const, ratePct: 1.70, effectiveDate: '2026-01-01' },
];
