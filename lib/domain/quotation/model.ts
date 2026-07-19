import type { TimelineEventName } from '../timeline/model';

export type InstitutionType =
  | 'bank'
  | 'tradingHouse'
  | 'broker'
  | 'insuranceCompany'
  | 'other';

export type Institution = {
  id: string;
  name: string;
  type: InstitutionType;
  active: boolean;
};

export type PricingComponentKind =
  | 'instrumentFee'
  | 'confirmationFee'
  | 'discounting'
  | 'forfaiting';

export type PricingCondition =
  | 'always'
  | 'confirmationRequired'
  | 'confirmationNotRequired';

export type DayCountConvention = 'ACT/360' | 'ACT/365' | '30/360';
export type BillingFrequency = 'once' | 'monthly' | 'quarterly';
export type PartialPeriodRounding = 'actual' | 'up';

export type PricingRate =
  | { type: 'fixedAmount'; amount: number }
  | { type: 'flatPercentage'; ratePct: number }
  | { type: 'annualizedPercentage'; ratePct: number }
  | {
      type: 'referencePlusSpread';
      referenceRateIndexId: string;
      spreadPct: number;
    };

export type PricingRecord = {
  id: string;
  label: string;
  kind: PricingComponentKind;
  condition: PricingCondition;
  rate: PricingRate;
  startEvent?: TimelineEventName;
  endEvent?: TimelineEventName;
  dayCountConvention?: DayCountConvention;
  billingFrequency?: BillingFrequency;
  partialPeriodRounding?: PartialPeriodRounding;
  minimumPeriodDays?: number;
  minimumFeeAmount?: number;
  includeStartDate?: boolean;
  includeEndDate?: boolean;
};

export type QuotationVersion = {
  id: string;
  version: number;
  status: 'draft' | 'active' | 'superseded' | 'withdrawn';
  validFrom: string;
  validTo?: string;
  pricing: PricingRecord[];
};

export type Quotation = {
  id: string;
  reference: string;
  institution: Institution;
  currency: string;
  productType: 'lcFinancing';
  tenorDays?: number;
  minAmount?: number;
  maxAmount?: number;
  issuingInstitutionIds: string[];
  versions: QuotationVersion[];
};

export type QuotationFilter = {
  quotationIds?: string[];
  institutionIds?: string[];
  includeAllApplicable?: boolean;
};

export type QuotationContext = {
  currency: string;
  amount: number;
  maturityDays: number;
  issuingInstitutionId?: string;
  asOfDate: string;
};

export type SelectedQuotation = {
  quotation: Quotation;
  version: QuotationVersion;
};
