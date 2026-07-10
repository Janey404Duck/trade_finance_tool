import type { AnchorType } from './anchors';

export type InstitutionType = 'bank' | 'trading_house' | 'broker' | 'insurance_company' | 'other';

export type SolutionPath = 'CONFIRMATION' | 'FORFAITING';

export type MaturityBasis = 'AFTER_SHIPMENT' | 'AFTER_LC_ISSUANCE';

export type QuoteComponentType =
  | 'CONFIRMATION'
  | 'DEFERRED'
  | 'DISCOUNTING'
  | 'FORFAITING'
  | 'OTHER';

export type ChargeType =
  | 'CONFIRMATION_FEE'
  | 'DEFERRED_PAYMENT_FEE'
  | 'DISCOUNTING_FEE'
  | 'FORFAITING_FEE'
  | 'HANDLING_FEE'
  | 'ISSUING_BANK_FEE'
  | 'OTHER';

export type PayerType = 'applicant' | 'beneficiary' | 'shared' | 'unknown';

export type RateType = 'flat_pct' | 'annual_pct' | 'base_plus_spread' | 'fixed_amount';

export type MinFeeFrequency = 'none' | 'transaction' | 'month';

export type CalculateInput = {
  issuingBankId: string;
  currency: string;
  transactionAmount: number;
  shipmentDaysAfterLcIssue: number;
  maturityBasis: MaturityBasis;
  maturityDays: number;
  selectedPaths: SolutionPath[];
  confirmationOptions?: {
    includeDiscounting: boolean;
    discountStartDaysAfterShipment?: number;
  };
  selectedQuotePackageIds?: string[];
};

export type AnchorDays = Record<AnchorType, number>;

export type ChargeRule = {
  id: string;
  quoteComponentId?: string;
  issuingBankFeeRuleId?: string;
  issuingBankId?: string;
  currency?: string;
  feeName?: string;
  chargeType: ChargeType;
  payer: PayerType;
  rateType: RateType;
  fixedRatePct?: number | null;
  baseRateKey?: string | null;
  spreadPct?: number | null;
  fixedAmount?: number | null;
  amountBasis: 'transaction_amount';
  dayCountBasis: 360 | 365;
  startAnchor?: AnchorType | null;
  startOffsetDays: number;
  endAnchor?: AnchorType | null;
  endOffsetDays: number;
  minFeeAmount?: number | null;
  minFeeFrequency: MinFeeFrequency;
  displayOrder: number;
  active?: boolean;
  notes?: string | null;
};

export type ReferenceRate = {
  id: string;
  rateKey: string;
  currency: string;
  tenorDays?: number | null;
  ratePct: number;
  rateDate: string;
  active: boolean;
  source?: string | null;
};

export type QuotePackage = {
  id: string;
  institutionId: string;
  institutionName: string;
  packageName: string;
  currency: string;
  appliesToAllIssuingBanks: boolean;
  minAmount?: number | null;
  maxAmount?: number | null;
  minMaturityDays?: number | null;
  maxMaturityDays?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  active: boolean;
  notes?: string | null;
};

export type QuoteComponent = {
  id: string;
  quotePackageId: string;
  componentType: QuoteComponentType;
  active: boolean;
  notes?: string | null;
};

export type ChargeResultLine = {
  sourceType: 'quote_charge_rule' | 'issuing_bank_fee_rule';
  sourceRuleId: string;
  quoteComponentId?: string | null;
  componentType?: QuoteComponentType | null;
  chargeType: ChargeType;
  payer: PayerType;
  startAnchor?: AnchorType | null;
  endAnchor?: AnchorType | null;
  startDay?: number | null;
  endDay?: number | null;
  chargeDays?: number | null;
  amount: number;
  rateType: RateType;
  fixedRatePct?: number | null;
  baseRateKey?: string | null;
  baseRatePct?: number | null;
  spreadPct?: number | null;
  effectiveRatePct?: number | null;
  fixedAmount?: number | null;
  dayCountBasis?: 360 | 365 | null;
  minFeeAmount?: number | null;
  minFeeFrequency: MinFeeFrequency;
  calculatedFee: number;
  finalFee: number;
  formulaText: string;
  excelFormulaTemplate: string;
  displayOrder: number;
};

export type CalculationPathResult = {
  quotePackageId: string;
  institutionId: string;
  institutionName: string;
  packageName: string;
  solutionPath: SolutionPath;
  includesDiscounting: boolean;
  eligible: boolean;
  ineligibilityReason?: string;
  confirmationCost: number;
  deferredCost: number;
  discountingCost: number;
  forfaitingCost: number;
  issuingBankCost: number;
  totalCost: number;
  allInPct: number;
  lines: ChargeResultLine[];
};

export type ScenarioData = {
  quotePackages: QuotePackage[];
  quotePackageIssuingBanks: Array<{ quotePackageId: string; issuingBankId: string }>;
  quoteComponents: QuoteComponent[];
  quoteChargeRules: ChargeRule[];
  issuingBankFeeRules: ChargeRule[];
  referenceRates: ReferenceRate[];
};

export type ScenarioResult = {
  assumptions: AnchorDays;
  results: CalculationPathResult[];
};
