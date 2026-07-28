import { describe, expect, it } from 'vitest';
import { compareScenario } from '@/lib/application/compareScenario';
import {
  issuingQuotation,
  nonIssuingQuotation,
  referenceRates,
  standardTimeline,
} from '../fixtures';

const command = {
  amount: 1_000_000,
  currency: 'USD',
  issuingInstitutionId: 'institution-ziraat',
  asOfDate: '2026-07-01',
  comparisonMode: 'allAvailableFees' as const,
  solutions: ['confirmationWithDiscounting', 'discountingOnly'] as const,
  nonIssuingSelection: { mode: 'all' as const },
  timeline: standardTimeline,
};

describe('compareScenario', () => {
  it('uses one issuing quotation across the quote-by-solution Cartesian product', () => {
    const citi = nonIssuingQuotation({
      id: 'non-issuing-2', reference: 'CITI-QT-2',
      institution: { id: 'institution-citi', name: 'Citi', type: 'bank', active: true },
    });
    const result = compareScenario(
      { ...command, solutions: [...command.solutions] },
      {
        issuingBankQuotations: [issuingQuotation()],
        nonIssuingBankQuotations: [nonIssuingQuotation(), citi],
        referenceRates,
      },
    );
    expect(result.results).toHaveLength(4);
    expect(result.issuingBank.cost.quotationReference).toBe('ZIRAAT-ISS-2026-001');
    expect(result.results.filter((row) => row.eligible).every(
      (row) => row.eligible && row.issuingBankCost.quotationId === 'issuing-quotation-1',
    )).toBe(true);
  });

  it('fails the run when issuingFee is missing', () => {
    const issuer = issuingQuotation({
      versions: [{
        ...issuingQuotation().versions[0],
        pricing: issuingQuotation().versions[0].pricing.filter((fee) => fee.kind !== 'issuingFee'),
      }],
    });
    expect(() => compareScenario(
      { ...command, solutions: [...command.solutions] },
      { issuingBankQuotations: [issuer], nonIssuingBankQuotations: [nonIssuingQuotation()], referenceRates },
    )).toThrow('missing issuingFee');
  });

  it('accepts an explicitly waived issuing fee at zero cost', () => {
    const waived = issuingQuotation({
      versions: [{
        ...issuingQuotation().versions[0],
        pricing: issuingQuotation().versions[0].pricing.map((fee) =>
          fee.kind === 'issuingFee'
            ? { ...fee, disclosureStatus: 'waived' as const, rate: undefined }
            : fee,
        ),
      }],
    });
    const waivedResult = compareScenario(
      { ...command, comparisonMode: 'coreFeesOnly', solutions: ['confirmationOnly'] },
      {
        issuingBankQuotations: [waived],
        nonIssuingBankQuotations: [nonIssuingQuotation()],
        referenceRates,
      },
    );
    expect(waivedResult.issuingBank.cost.lines[0]).toMatchObject({
      disclosureStatus: 'waived',
      finalCost: 0,
    });
  });

  it('marks every all-fees result incomplete when issuing SWIFT is absent', () => {
    const issuer = issuingQuotation({
      versions: [{
        ...issuingQuotation().versions[0],
        pricing: issuingQuotation().versions[0].pricing.filter((fee) => fee.kind !== 'swiftFee'),
      }],
    });
    const result = compareScenario(
      { ...command, solutions: ['confirmationOnly'] },
      { issuingBankQuotations: [issuer], nonIssuingBankQuotations: [nonIssuingQuotation()], referenceRates },
    );
    expect(result.issuingBank.coverageStatus).toBe('incomplete');
    expect(result.issuingBank.missingFees[0]).toMatchObject({
      quotationSide: 'issuingBank', feeKind: 'swiftFee',
    });
    expect(result.results[0]).toMatchObject({ eligible: true, coverageStatus: 'incomplete' });
  });

  it('ignores all administrative missing-fee checks in core-only mode', () => {
    const issuer = issuingQuotation({
      versions: [{
        ...issuingQuotation().versions[0],
        pricing: issuingQuotation().versions[0].pricing.filter((fee) => fee.kind !== 'swiftFee'),
      }],
    });
    const nonIssuer = nonIssuingQuotation({
      versions: [{
        ...nonIssuingQuotation().versions[0],
        pricing: nonIssuingQuotation().versions[0].pricing.filter((fee) =>
          ['confirmationFee', 'discounting', 'forfaiting'].includes(fee.kind),
        ),
      }],
    });
    const result = compareScenario(
      { ...command, comparisonMode: 'coreFeesOnly', solutions: ['discountingOnly'] },
      { issuingBankQuotations: [issuer], nonIssuingBankQuotations: [nonIssuer], referenceRates },
    );
    expect(result.results[0]).toMatchObject({ eligible: true, coverageStatus: 'complete' });
  });

  it('reports exact non-issuing admin kinds from the fixed solution matrix', () => {
    const nonIssuer = nonIssuingQuotation({
      versions: [{
        ...nonIssuingQuotation().versions[0],
        pricing: nonIssuingQuotation().versions[0].pricing.filter((fee) =>
          fee.kind !== 'handlingFee' && fee.kind !== 'negotiationFee',
        ),
      }],
    });
    const result = compareScenario(
      { ...command, solutions: ['discountingOnly'] },
      { issuingBankQuotations: [issuingQuotation()], nonIssuingBankQuotations: [nonIssuer], referenceRates },
    );
    const row = result.results[0];
    expect(row.eligible).toBe(true);
    if (row.eligible) {
      expect(row.missingFees.map((issue) => issue.feeKind)).toEqual([
        'handlingFee', 'negotiationFee',
      ]);
      expect(row.lines.some((line) => line.kind === 'handlingFee')).toBe(false);
    }
  });

  it('keeps unsupported non-issuing quote/solution pairs visible as ineligible', () => {
    const quote = nonIssuingQuotation({
      versions: [{
        ...nonIssuingQuotation().versions[0],
        pricing: nonIssuingQuotation().versions[0].pricing.filter((fee) =>
          fee.id !== 'discount-unconfirmed',
        ),
      }],
    });
    const result = compareScenario(
      { ...command, solutions: ['discountingOnly'] },
      { issuingBankQuotations: [issuingQuotation()], nonIssuingBankQuotations: [quote], referenceRates },
    );
    expect(result.results[0]).toMatchObject({
      eligible: false, missingCoreFees: ['discounting'],
    });
  });

  it('ranks complete rows globally by cost across different solutions', () => {
    const result = compareScenario(
      {
        ...command,
        comparisonMode: 'coreFeesOnly',
        solutions: ['discountingOnly', 'confirmationOnly'],
      },
      {
        issuingBankQuotations: [issuingQuotation()],
        nonIssuingBankQuotations: [nonIssuingQuotation()],
        referenceRates,
      },
    );
    expect(result.results.map((row) => row.solution)).toEqual([
      'confirmationOnly',
      'discountingOnly',
    ]);
  });
});
