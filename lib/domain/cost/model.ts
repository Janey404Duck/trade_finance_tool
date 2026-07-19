import type { FinancingSelection } from '../financing/model';
import type {
  DayCountConvention,
  PricingComponentKind,
  PricingRate,
} from '../quotation/model';
import type { ResolvedTimeline } from '../timeline/model';

export type ReferenceRate = {
  indexId: string;
  name: string;
  ratePct: number;
  effectiveDate: string;
};

export type CostCalculationContext = {
  amount: number;
  currency: string;
  financing: FinancingSelection;
  timeline: ResolvedTimeline;
  referenceRates: ReferenceRate[];
};

export type CostLine = {
  pricingRecordId: string;
  label: string;
  kind: PricingComponentKind;
  startDay?: number;
  endDay?: number;
  chargeDays?: number;
  rate: PricingRate;
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
  currency: string;
  amount: number;
  lines: CostLine[];
  instrumentCost: number;
  confirmationCost: number;
  financingCost: number;
  totalCost: number;
  allInPct: number;
};
