import type { ReferenceRate } from '@/lib/domain/cost/model';
import type {
  Quotation,
  QuotationFilter,
  TermReferenceRateFamily,
} from '@/lib/domain/quotation/model';

export interface QuotationRepository {
  findApplicable(filter: QuotationFilter): Promise<Quotation[]>;
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
