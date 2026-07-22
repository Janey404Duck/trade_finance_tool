import type { ComparisonCase, FinancingComponent } from '../financing/model';
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

export const coreFeeKinds = [
  'issuingFee',
  'confirmationFee',
  'deferredPaymentFee',
  'discounting',
  'forfaiting',
] as const;

export const administrativeFeeKinds = [
  'advisingFee',
  'negotiationFee',
  'amendmentFee',
  'swiftFee',
  'discrepancyFee',
  'handlingFee',
  'otherAdministrativeFee',
] as const;

export const pricingComponentKinds = [
  ...coreFeeKinds,
  ...administrativeFeeKinds,
] as const;

export type CoreFeeKind = (typeof coreFeeKinds)[number];
export type AdministrativeFeeKind = (typeof administrativeFeeKinds)[number];
export type PricingComponentKind = (typeof pricingComponentKinds)[number];
export type ComparisonMode = 'coreFeesOnly' | 'allAvailableFees';
export type FeeInclusionMode = 'automatic' | 'conditional';
export type FeeDisclosureStatus = 'priced' | 'waived' | 'notApplicable';
export type InstitutionRole =
  | 'issuingBank'
  | 'confirmingBank'
  | 'advisingBank'
  | 'negotiatingBank'
  | 'financingProvider';

export type DayCountConvention = 'ACT/360' | 'ACT/365' | '30/360';
export type BillingFrequency = 'once' | 'monthly' | 'quarterly';
export type PartialPeriodRounding = 'actual' | 'up';

export type PricingRate =
  | { type: 'fixedAmount'; amount: number }
  | { type: 'flatPercentage'; ratePct: number }
  | { type: 'annualizedPercentage'; ratePct: number }
  | {
      type: 'referencePlusSpread';
      referenceRateFamily: TermReferenceRateFamily;
      spreadPct: number;
    };

export type TermReferenceRateFamily = 'TERM_SOFR' | 'TERM_SHIBOR';
export type TermReferenceRateTenorMonths = 1 | 3 | 6 | 12;

export type PricingRecord = {
  id: string;
  feeCode: string;
  label: string;
  kind: PricingComponentKind;
  disclosureStatus: FeeDisclosureStatus;
  inclusionMode: FeeInclusionMode;
  chargedByInstitutionId: string;
  chargedByRole: InstitutionRole;
  requiredComponents: FinancingComponent[];
  excludedComponents: FinancingComponent[];
  rate?: PricingRate;
  startEvent?: TimelineEventName;
  endEvent?: TimelineEventName;
  dayCountConvention?: DayCountConvention;
  billingFrequency?: BillingFrequency;
  partialPeriodRounding?: PartialPeriodRounding;
  minimumPeriodDays?: number;
  minimumFeeAmount?: number;
  includeStartDate?: boolean;
  includeEndDate?: boolean;
  source?: 'quotation' | 'institutionSchedule';
  sourceId?: string;
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

export type InstitutionFeeSchedule = {
  id: string;
  institution: Institution;
  currency: string;
  role: InstitutionRole;
  status: 'draft' | 'active' | 'superseded' | 'withdrawn';
  validFrom: string;
  validTo?: string;
  pricing: PricingRecord[];
};

export type FeeCoverageSlot = {
  feeCode: string;
  kind: AdministrativeFeeKind;
  chargedByRole: InstitutionRole;
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

export function isCoreFeeKind(kind: PricingComponentKind): kind is CoreFeeKind {
  return (coreFeeKinds as readonly PricingComponentKind[]).includes(kind);
}

export function isAdministrativeFeeKind(
  kind: PricingComponentKind,
): kind is AdministrativeFeeKind {
  return (administrativeFeeKinds as readonly PricingComponentKind[]).includes(kind);
}

export function pricingRecordApplies(
  record: PricingRecord,
  comparisonCase: ComparisonCase,
): boolean {
  return (
    record.requiredComponents.every((component) =>
      comparisonCase.components.includes(component),
    ) &&
    record.excludedComponents.every(
      (component) => !comparisonCase.components.includes(component),
    )
  );
}

export function feeSlotKey(slot: FeeCoverageSlot): string {
  return `${slot.feeCode}:${slot.kind}:${slot.chargedByRole}`;
}
