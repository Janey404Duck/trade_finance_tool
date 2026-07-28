import type {
  IssuingBankFeeRecord,
  IssuingBankQuotation,
  NonIssuingBankFeeRecord,
  NonIssuingBankQuotation,
} from '@/lib/domain/quotation/model';
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

export function issuingFee(
  overrides: Partial<IssuingBankFeeRecord> &
    Pick<IssuingBankFeeRecord, 'id' | 'label' | 'kind'>,
): IssuingBankFeeRecord {
  return {
    feeCode: overrides.kind,
    disclosureStatus: 'priced',
    rate: { type: 'fixedAmount', amount: 100 },
    ...overrides,
  };
}

export function nonIssuingFee(
  overrides: Partial<NonIssuingBankFeeRecord> &
    Pick<NonIssuingBankFeeRecord, 'id' | 'label' | 'kind'>,
): NonIssuingBankFeeRecord {
  return {
    feeCode: overrides.kind,
    disclosureStatus: 'priced',
    applicableSolutions: [
      'confirmationOnly',
      'confirmationWithDiscounting',
      'discountingOnly',
      'forfaitingOnly',
      'confirmationWithForfaiting',
    ],
    rate: { type: 'fixedAmount', amount: 100 },
    ...overrides,
  };
}

export function issuingQuotation(
  overrides: Partial<IssuingBankQuotation> = {},
): IssuingBankQuotation {
  return {
    id: 'issuing-quotation-1',
    reference: 'ZIRAAT-ISS-2026-001',
    institution: {
      id: 'institution-ziraat',
      name: 'Ziraat Bank',
      type: 'bank',
      active: true,
    },
    currency: 'USD',
    productType: 'issuingBankFees',
    tenorDays: 450,
    versions: [{
      id: 'issuing-version-1',
      version: 1,
      status: 'active',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      pricing: [
        issuingFee({
          id: 'issuing-fee',
          label: 'Issuing fee',
          kind: 'issuingFee',
          rate: { type: 'annualizedPercentage', ratePct: 0.25 },
          startEvent: 'lcIssuance',
          endEvent: 'lcMaturity',
          dayCountConvention: 'ACT/360',
        }),
        issuingFee({
          id: 'issuing-swift',
          label: 'Issuing-bank SWIFT fee',
          kind: 'swiftFee',
          rate: { type: 'fixedAmount', amount: 60 },
        }),
      ],
    }],
    ...overrides,
  };
}

export function nonIssuingQuotation(
  overrides: Partial<NonIssuingBankQuotation> = {},
): NonIssuingBankQuotation {
  const confirmationSolutions = [
    'confirmationOnly',
    'confirmationWithDiscounting',
    'confirmationWithForfaiting',
  ] as const;
  const earlyPaymentSolutions = [
    'confirmationWithDiscounting',
    'discountingOnly',
    'forfaitingOnly',
    'confirmationWithForfaiting',
  ] as const;
  return {
    id: 'non-issuing-quotation-1',
    reference: 'SCB-QT-2026-001',
    institution: {
      id: 'institution-scb',
      name: 'Standard Chartered',
      type: 'bank',
      active: true,
    },
    currency: 'USD',
    productType: 'lcFinancing',
    tenorDays: 450,
    issuingInstitutionIds: ['institution-ziraat'],
    versions: [{
      id: 'non-issuing-version-1',
      version: 1,
      status: 'active',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      pricing: [
        nonIssuingFee({
          id: 'confirmation', label: 'Confirmation fee', kind: 'confirmationFee',
          applicableSolutions: [...confirmationSolutions],
          rate: { type: 'annualizedPercentage', ratePct: 0.9 },
          startEvent: 'lcIssuance', endEvent: 'lcMaturity', dayCountConvention: 'ACT/360',
        }),
        nonIssuingFee({
          id: 'discount-confirmed', feeCode: 'discounting-confirmed',
          label: 'Discounting with confirmation', kind: 'discounting',
          applicableSolutions: ['confirmationWithDiscounting'],
          rate: { type: 'referencePlusSpread', referenceRateFamily: 'TERM_SOFR', spreadPct: 0.6 },
          startEvent: 'supplierPayment', endEvent: 'lcMaturity', dayCountConvention: 'ACT/360',
        }),
        nonIssuingFee({
          id: 'discount-unconfirmed', feeCode: 'discounting-unconfirmed',
          label: 'Discounting without confirmation', kind: 'discounting',
          applicableSolutions: ['discountingOnly'],
          rate: { type: 'referencePlusSpread', referenceRateFamily: 'TERM_SOFR', spreadPct: 4 },
          startEvent: 'supplierPayment', endEvent: 'lcMaturity', dayCountConvention: 'ACT/360',
        }),
        nonIssuingFee({
          id: 'forfaiting-unconfirmed', feeCode: 'forfaiting-unconfirmed',
          label: 'Forfaiting without confirmation', kind: 'forfaiting',
          applicableSolutions: ['forfaitingOnly'],
          rate: { type: 'referencePlusSpread', referenceRateFamily: 'TERM_SOFR', spreadPct: 2 },
          startEvent: 'supplierPayment', endEvent: 'lcMaturity', dayCountConvention: 'ACT/360',
        }),
        nonIssuingFee({
          id: 'forfaiting-confirmed', feeCode: 'forfaiting-confirmed',
          label: 'Forfaiting with confirmation', kind: 'forfaiting',
          applicableSolutions: ['confirmationWithForfaiting'],
          rate: { type: 'referencePlusSpread', referenceRateFamily: 'TERM_SOFR', spreadPct: 0.8 },
          startEvent: 'supplierPayment', endEvent: 'lcMaturity', dayCountConvention: 'ACT/360',
        }),
        nonIssuingFee({
          id: 'advising', label: 'Advising fee', kind: 'advisingFee',
          rate: { type: 'fixedAmount', amount: 150 },
        }),
        nonIssuingFee({
          id: 'non-issuing-swift', label: 'SWIFT fee', kind: 'swiftFee',
          rate: { type: 'fixedAmount', amount: 75 },
        }),
        nonIssuingFee({
          id: 'handling', label: 'Handling fee waived', kind: 'handlingFee',
          disclosureStatus: 'waived', rate: undefined,
        }),
        nonIssuingFee({
          id: 'negotiation', label: 'Negotiation fee', kind: 'negotiationFee',
          applicableSolutions: [...earlyPaymentSolutions],
          rate: { type: 'fixedAmount', amount: 250 },
        }),
      ],
    }],
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
