import type { ReferenceRate } from '@/lib/domain/cost/model';
import type {
  IssuingBankQuotation,
  NonIssuingBankQuotation,
  QuotationApplicabilityContext,
  TermReferenceRateFamily,
} from '@/lib/domain/quotation/model';

export interface IssuingBankQuotationRepository {
  findApplicable(context: QuotationApplicabilityContext): Promise<IssuingBankQuotation[]>;
}

export interface NonIssuingBankQuotationRepository {
  findApplicable(context: QuotationApplicabilityContext): Promise<NonIssuingBankQuotation[]>;
}

export interface ReferenceRateRepository {
  findAsOf(
    families: Array<{ family: TermReferenceRateFamily; currency: string }>,
    asOfDate: string,
  ): Promise<ReferenceRate[]>;
}

export interface ComparisonRepository {
  save(snapshot: unknown): Promise<{ id: string }>;
}
