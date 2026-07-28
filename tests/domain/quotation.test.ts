import { describe, expect, it } from 'vitest';
import {
  resolveIssuingBankQuotation,
  selectNonIssuingBankQuotations,
} from '@/lib/domain/quotation/selectQuotations';
import { issuingQuotation, nonIssuingQuotation } from '../fixtures';

const context = {
  amount: 1_000_000,
  currency: 'USD',
  maturityDays: 370,
  issuingInstitutionId: 'institution-ziraat',
  asOfDate: '2026-07-01',
};

describe('quotation selection', () => {
  it('resolves the sole issuing quotation and latest active version', () => {
    const selected = resolveIssuingBankQuotation([issuingQuotation({
      versions: [
        { ...issuingQuotation().versions[0], id: 'v1', version: 1 },
        { ...issuingQuotation().versions[0], id: 'v2', version: 2 },
      ],
    })], context);
    expect(selected.version.id).toBe('v2');
  });

  it('rejects zero or multiple issuing quotation matches', () => {
    expect(() => resolveIssuingBankQuotation([], context)).toThrow('No applicable active');
    expect(() => resolveIssuingBankQuotation([
      issuingQuotation(),
      issuingQuotation({ id: 'issuing-2', reference: 'ISS-2' }),
    ], context)).toThrow('exactly one');
  });

  it('supports all and institution non-issuing selection modes', () => {
    const scb = nonIssuingQuotation();
    const citi = nonIssuingQuotation({
      id: 'non-issuing-2', reference: 'CITI-2',
      institution: { id: 'institution-citi', name: 'Citi', type: 'bank', active: true },
    });
    expect(selectNonIssuingBankQuotations([scb, citi], context, { mode: 'all' })).toHaveLength(2);
    expect(selectNonIssuingBankQuotations([scb, citi], context, {
      mode: 'institutions', institutionIds: ['institution-citi'],
    }).map((item) => item.quotation.id)).toEqual(['non-issuing-2']);
  });

  it('omits inapplicable rows from broad selection and requires nonempty unique explicit selection', () => {
    const applicable = nonIssuingQuotation();
    const otherIssuer = nonIssuingQuotation({
      id: 'other-issuer',
      reference: 'OTHER-ISSUER',
      issuingInstitutionIds: ['institution-other'],
    });
    expect(selectNonIssuingBankQuotations(
      [applicable, otherIssuer],
      context,
      { mode: 'all' },
    ).map((item) => item.quotation.id)).toEqual(['non-issuing-quotation-1']);
    expect(() => selectNonIssuingBankQuotations(
      [applicable],
      context,
      { mode: 'quotations', quotationIds: [] },
    )).toThrow('at least one');
    expect(() => selectNonIssuingBankQuotations(
      [applicable],
      context,
      {
        mode: 'quotations',
        quotationIds: ['non-issuing-quotation-1', 'non-issuing-quotation-1'],
      },
    )).toThrow('unique');
  });

  it('rejects explicitly selected unknown or inapplicable quotations', () => {
    expect(() => selectNonIssuingBankQuotations([nonIssuingQuotation()], context, {
      mode: 'quotations', quotationIds: ['missing'],
    })).toThrow('Unknown');
    expect(() => selectNonIssuingBankQuotations([
      nonIssuingQuotation({ currency: 'EUR' }),
    ], context, { mode: 'quotations', quotationIds: ['non-issuing-quotation-1'] })).toThrow(
      'not applicable',
    );
  });
});
