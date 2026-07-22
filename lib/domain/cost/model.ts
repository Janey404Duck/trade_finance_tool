import type { ComparisonCase } from '../financing/model';
import type {
  AdministrativeFeeKind,
  ComparisonMode,
  DayCountConvention,
  FeeCoverageSlot,
  FeeDisclosureStatus,
  FeeInclusionMode,
  InstitutionRole,
  PricingComponentKind,
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

export type CostCalculationContext = {
  amount: number;
  currency: string;
  comparisonCase: ComparisonCase;
  comparisonMode: ComparisonMode;
  includedConditionalFeeKinds?: AdministrativeFeeKind[];
  expectedAdministrativeFeeSlots?: FeeCoverageSlot[];
  timeline: ResolvedTimeline;
  referenceRates: ReferenceRate[];
};

export type CostLine = {
  pricingRecordId: string;
  feeCode: string;
  label: string;
  kind: PricingComponentKind;
  inclusionMode: FeeInclusionMode;
  disclosureStatus: FeeDisclosureStatus;
  chargedByInstitutionId: string;
  chargedByRole: InstitutionRole;
  source: 'quotation' | 'institutionSchedule';
  sourceId?: string;
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

export type QuotationCost = {
  quotationId: string;
  quotationReference: string;
  quotationVersionId: string;
  institutionId: string;
  institutionName: string;
  comparisonCaseId: string;
  comparisonCaseLabel: string;
  selectedComponents: ComparisonCase['components'];
  comparisonMode: ComparisonMode;
  currency: string;
  amount: number;
  lines: CostLine[];
  coreCost: number;
  administrativeCost: number;
  confirmationCost: number;
  deferredPaymentCost: number;
  financingCost: number;
  totalCost: number;
  allInPct: number;
  coverageStatus: 'complete' | 'incomplete';
  missingAdministrativeFeeSlots: FeeCoverageSlot[];
};
