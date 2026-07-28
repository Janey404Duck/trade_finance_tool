import type { SolutionKind } from '../financing/model';
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

export const issuingBankFeeKinds = ['issuingFee', 'swiftFee'] as const;
export const nonIssuingCoreFeeKinds = [
  'confirmationFee',
  'deferredPaymentFee',
  'discounting',
  'forfaiting',
] as const;
export const nonIssuingAdministrativeFeeKinds = [
  'advisingFee',
  'negotiationFee',
  'swiftFee',
  'handlingFee',
  'otherAdministrativeFee',
] as const;
export const nonIssuingFeeKinds = [
  ...nonIssuingCoreFeeKinds,
  ...nonIssuingAdministrativeFeeKinds,
] as const;

export type IssuingBankFeeKind = (typeof issuingBankFeeKinds)[number];
export type NonIssuingCoreFeeKind = (typeof nonIssuingCoreFeeKinds)[number];
export type NonIssuingAdministrativeFeeKind =
  (typeof nonIssuingAdministrativeFeeKinds)[number];
export type NonIssuingFeeKind = (typeof nonIssuingFeeKinds)[number];
export type FeeKind = IssuingBankFeeKind | NonIssuingFeeKind;
export type ComparisonMode = 'coreFeesOnly' | 'allAvailableFees';
export type FeeDisclosureStatus = 'priced' | 'waived';

export type DayCountConvention = 'ACT/360' | 'ACT/365' | '30/360';
export type BillingFrequency = 'once' | 'monthly' | 'quarterly';
export type PartialPeriodRounding = 'actual' | 'up';
export type TermReferenceRateFamily = 'TERM_SOFR' | 'TERM_SHIBOR';
export type TermReferenceRateTenorMonths = 1 | 3 | 6 | 12;

export type PricingRate =
  | { type: 'fixedAmount'; amount: number }
  | { type: 'flatPercentage'; ratePct: number }
  | { type: 'annualizedPercentage'; ratePct: number }
  | {
      type: 'referencePlusSpread';
      referenceRateFamily: TermReferenceRateFamily;
      spreadPct: number;
    };

export type BaseFeeRecord<Kind extends FeeKind> = {
  id: string;
  feeCode: string;
  label: string;
  kind: Kind;
  disclosureStatus: FeeDisclosureStatus;
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
};

export type IssuingBankFeeRecord = BaseFeeRecord<IssuingBankFeeKind>;
export type NonIssuingBankFeeRecord = BaseFeeRecord<NonIssuingFeeKind> & {
  applicableSolutions: SolutionKind[];
};

export type QuotationVersionBase<Pricing> = {
  id: string;
  version: number;
  status: 'draft' | 'active' | 'superseded' | 'withdrawn';
  validFrom: string;
  validTo?: string;
  pricing: Pricing[];
};

export type IssuingBankQuotationVersion =
  QuotationVersionBase<IssuingBankFeeRecord>;
export type NonIssuingBankQuotationVersion =
  QuotationVersionBase<NonIssuingBankFeeRecord>;

export type QuotationBase<Version> = {
  id: string;
  reference: string;
  institution: Institution;
  currency: string;
  tenorDays?: number;
  minAmount?: number;
  maxAmount?: number;
  versions: Version[];
};

export type IssuingBankQuotation =
  QuotationBase<IssuingBankQuotationVersion> & {
    productType: 'issuingBankFees';
  };

export type NonIssuingBankQuotation =
  QuotationBase<NonIssuingBankQuotationVersion> & {
    productType: 'lcFinancing';
    issuingInstitutionIds: string[];
  };

export type NonIssuingQuotationSelection =
  | { mode: 'all' }
  | { mode: 'institutions'; institutionIds: string[] }
  | { mode: 'quotations'; quotationIds: string[] };

export type QuotationApplicabilityContext = {
  currency: string;
  amount: number;
  maturityDays: number;
  issuingInstitutionId: string;
  asOfDate: string;
};

export type SelectedIssuingBankQuotation = {
  quotation: IssuingBankQuotation;
  version: IssuingBankQuotationVersion;
};

export type SelectedNonIssuingBankQuotation = {
  quotation: NonIssuingBankQuotation;
  version: NonIssuingBankQuotationVersion;
};

export function isNonIssuingCoreFeeKind(
  kind: FeeKind,
): kind is NonIssuingCoreFeeKind {
  return (nonIssuingCoreFeeKinds as readonly FeeKind[]).includes(kind);
}

export function isNonIssuingAdministrativeFeeKind(
  kind: FeeKind,
): kind is NonIssuingAdministrativeFeeKind {
  return (nonIssuingAdministrativeFeeKinds as readonly FeeKind[]).includes(kind);
}

export function nonIssuingFeeApplies(
  record: NonIssuingBankFeeRecord,
  solution: SolutionKind,
): boolean {
  return record.applicableSolutions.includes(solution);
}
