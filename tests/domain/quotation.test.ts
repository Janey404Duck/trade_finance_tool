import { describe, expect, it } from 'vitest';
import { selectQuotations } from '@/lib/domain/quotation/selectQuotations';
import { quotation } from '../fixtures';

describe('selectQuotations', () => {
  it('filters by applicability and resolves the latest active version', () => {
    const item = quotation({
      versions: [
        { id: 'v1', version: 1, status: 'active', validFrom: '2026-01-01', validTo: '2026-12-31', pricing: [] },
        { id: 'v2', version: 2, status: 'active', validFrom: '2026-06-01', validTo: '2026-12-31', pricing: [] },
      ],
    });
    const selected = selectQuotations([item], {
      amount: 1_000_000,
      currency: 'USD',
      maturityDays: 370,
      asOfDate: '2026-07-01',
    });
    expect(selected).toHaveLength(1);
    expect(selected[0].version.id).toBe('v2');
  });

  it('keeps product-incomplete quotes so each comparison case can report ineligibility', () => {
    const item = quotation({
      versions: [{ id: 'no-pricing', version: 1, status: 'active', validFrom: '2026-01-01', pricing: [] }],
    });
    expect(selectQuotations([item], {
      amount: 1_000_000,
      currency: 'USD',
      maturityDays: 370,
      asOfDate: '2026-07-01',
    })).toHaveLength(1);
  });

  it('excludes a quotation outside transaction constraints', () => {
    const item = quotation({ currency: 'EUR', minAmount: 2_000_000, tenorDays: 300 });
    expect(selectQuotations([item], {
      amount: 1_000_000,
      currency: 'USD',
      maturityDays: 360,
      asOfDate: '2026-07-01',
    })).toEqual([]);
  });
});
