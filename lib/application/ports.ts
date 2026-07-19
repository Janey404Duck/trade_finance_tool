import type { ReferenceRate } from '@/lib/domain/cost/model';
import type { Quotation, QuotationFilter } from '@/lib/domain/quotation/model';

export interface QuotationRepository {
  findApplicable(filter: QuotationFilter): Promise<Quotation[]>;
}

export interface ReferenceRateRepository {
  findAsOf(indexIds: string[], asOfDate: string): Promise<ReferenceRate[]>;
}

export interface ComparisonRepository {
  save(snapshot: unknown): Promise<{ id: string }>;
}
