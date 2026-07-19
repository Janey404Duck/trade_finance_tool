import { describe, expect, it } from 'vitest';
import { selectQuotations } from '@/lib/domain/quotation/selectQuotations';
import { quotation } from '../fixtures';

describe('selectQuotations', () => {
  it('filters by applicability and resolves the latest active version', () => {
    const item = quotation({
      versions: [
        {
          id: 'v1',
          version: 1,
          status: 'active',
          validFrom: '2026-01-01',
          validTo: '2026-12-31',
          pricing: [],
        },
        {
          id: 'v2',
          version: 2,
          status: 'active',
          validFrom: '2026-06-01',
          validTo: '2026-12-31',
          pricing: [],
        },
      ],
    });

    const selected = selectQuotations([item], {
      amount: 1_000_000,
      currency: 'USD',
      maturityDays: 370,
      asOfDate: '2026-07-01',
      financing: {
        confirmationRequired: false,
        discounting: false,
        forfaiting: false,
      },
    });

    expect(selected).toHaveLength(1);
    expect(selected[0].version.id).toBe('v2');
  });

  it('keeps internal IDs separate from human-facing references', () => {
    const item = quotation();
    expect(item.id).not.toBe(item.reference);
    expect(item.reference).toBe('SCB-QT-2026-001');
  });

  it('excludes a quotation outside amount, currency, tenor, or issuer constraints', () => {
    const item = quotation({
      currency: 'EUR',
      minAmount: 2_000_000,
      tenorDays: 300,
      issuingInstitutionIds: ['issuer-a'],
    });
    const selected = selectQuotations([item], {
      amount: 1_000_000,
      currency: 'USD',
      maturityDays: 360,
      issuingInstitutionId: 'issuer-b',
      asOfDate: '2026-07-01',
      financing: {
        confirmationRequired: false,
        discounting: false,
        forfaiting: false,
      },
    });
    expect(selected).toEqual([]);
  });

  it('excludes a quotation that lacks discounting pricing for the confirmation choice', () => {
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

    const selected = selectQuotations([item], {
      amount: 1_000_000,
      currency: 'USD',
      maturityDays: 370,
      asOfDate: '2026-07-01',
      financing: {
        confirmationRequired: false,
        discounting: true,
        forfaiting: false,
      },
    });

    expect(selected).toEqual([]);
  });
});
