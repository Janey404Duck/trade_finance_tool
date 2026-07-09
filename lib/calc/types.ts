import type { AnchorType } from './anchors';

export type InstitutionType = 'bank' | 'trading_house' | 'broker' | 'insurance_company' | 'other';

export type FinancingType =
  | 'confirmation'
  | 'discounting'
  | 'forfaiting'
  | 'mixed'
  | 'issuing_fee'
  | 'trading_house';

export type ChargeType =
  | 'confirmation'
  | 'deferred'
  | 'discounting'
  | 'forfaiting'
  | 'issuing_fee'
  | 'handling'
  | 'amendment'
  | 'other';

export type PayerType = 'applicant' | 'beneficiary' | 'shared' | 'unknown';

export type RateType = 'flat_pct' | 'annual_pct' | 'base_plus_spread' | 'fixed_amount';

export type MinFeeFrequency = 'none' | 'transaction' | 'month';

export type CalculateInput = {
  issuingBankId: string;
  currency: string;
  transactionAmount: number;
  lcMaturityDays: number;
  shipmentDays: number;
  paymentTermsDays: number;
  selectedQuoteIds?: string[];
};

export type AnchorDays = Record<AnchorType, number>;

export type ChargeRule = {
  id: string;
  quoteId?: string;
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

export type Quote = {
  id: string;
  institutionId: string;
  institutionName: string;
  quoteName: string;
  currency: string;
  financingType: FinancingType;
  requiresConfirmation: boolean;
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

export type ChargeResultLine = {
  sourceType: 'quote_charge_rule' | 'issuing_bank_fee_rule';
  sourceRuleId: string;
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

export type QuoteCalculationResult = {
  quoteId: string;
  institutionId: string;
  institutionName: string;
  quoteName: string;
  financingType: FinancingType;
  eligible: boolean;
  ineligibilityReason?: string;
  externalQuoteCost: number;
  issuingBankCost: number;
  totalCost: number;
  allInPct: number;
  lines: ChargeResultLine[];
};

export type ScenarioData = {
  quotes: Quote[];
  quoteIssuingBanks: Array<{ quoteId: string; issuingBankId: string }>;
  quoteChargeRules: ChargeRule[];
  issuingBankFeeRules: ChargeRule[];
  referenceRates: ReferenceRate[];
};

export type ScenarioResult = {
  assumptions: AnchorDays;
  results: QuoteCalculationResult[];
};
