import type { SolutionKind } from '../financing/model';
import type {
  ComparisonMode,
  DayCountConvention,
  FeeDisclosureStatus,
  FeeKind,
  IssuingBankFeeKind,
  NonIssuingAdministrativeFeeKind,
  PricingRate,
  TermReferenceRateFamily,
  TermReferenceRateTenorMonths,
} from '../quotation/model';
import type { ResolvedTimeline } from '../timeline/model';

export type ReferenceRate = {
  indexId: string;
  name: string;
  family: TermReferenceRateFamily;
  currency: string;
  tenorMonths: TermReferenceRateTenorMonths;
  ratePct: number;
  effectiveDate: string;
};

export type FeeCalculationContext = {
  amount: number;
  currency: string;
  timeline: ResolvedTimeline;
  referenceRates: ReferenceRate[];
};

export type CostLine = {
  quotationSide: 'issuingBank' | 'nonIssuingBank';
  quotationId: string;
  quotationVersionId: string;
  institutionId: string;
  institutionName: string;
  feeRecordId: string;
  feeCode: string;
  label: string;
  kind: FeeKind;
  disclosureStatus: FeeDisclosureStatus;
  startDay?: number;
  endDay?: number;
  chargeDays?: number;
  rate?: PricingRate;
  referenceRate?: ReferenceRate;
  baseRatePct?: number;
  effectiveRatePct?: number;
  dayCountConvention?: DayCountConvention;
  calculatedCost: number;
  finalCost: number;
};

export type IssuingBankQuotationCost = {
  quotationId: string;
  quotationReference: string;
  quotationVersionId: string;
  institutionId: string;
  institutionName: string;
  lines: CostLine[];
  coreCost: number;
  administrativeCost: number;
  totalCost: number;
};

export type NonIssuingBankQuotationCost = {
  quotationId: string;
  quotationReference: string;
  quotationVersionId: string;
  institutionId: string;
  institutionName: string;
  solution: SolutionKind;
  lines: CostLine[];
  coreCost: number;
  administrativeCost: number;
  confirmationCost: number;
  deferredPaymentCost: number;
  financingCost: number;
  totalCost: number;
};

export type MissingFeeIssue = {
  quotationSide: 'issuingBank' | 'nonIssuingBank';
  institutionId: string;
  institutionName: string;
  quotationId: string;
  quotationReference: string;
  quotationVersionId: string;
  solution?: SolutionKind;
  feeKind: IssuingBankFeeKind | NonIssuingAdministrativeFeeKind;
};

export type CombinedQuotationCost = {
  solution: SolutionKind;
  comparisonMode: ComparisonMode;
  currency: string;
  amount: number;
  issuingBankCost: IssuingBankQuotationCost;
  nonIssuingBankCost: NonIssuingBankQuotationCost;
  lines: CostLine[];
  coreCost: number;
  administrativeCost: number;
  totalCost: number;
  allInPct: number;
  coverageStatus: 'complete' | 'incomplete';
  missingFees: MissingFeeIssue[];
};
