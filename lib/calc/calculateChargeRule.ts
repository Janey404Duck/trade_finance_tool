import { buildExcelFormulaTemplate, buildFormulaText } from './formulas';
import { resolveRate } from './resolveRate';
import type { AnchorDays, CalculateInput, ChargeResultLine, ChargeRule, ReferenceRate } from './types';

export type CalculateChargeRuleParams = {
  rule: ChargeRule;
  input: CalculateInput;
  anchorDays: AnchorDays;
  referenceRates: ReferenceRate[];
  sourceType: ChargeResultLine['sourceType'];
};

export function calculateChargeRule({
  rule,
  input,
  anchorDays,
  referenceRates,
  sourceType,
}: CalculateChargeRuleParams): ChargeResultLine {
  const amount = input.transactionAmount;
  const { startDay, endDay, chargeDays } = resolveChargeDays(rule, anchorDays);
  const { baseRatePct, effectiveRatePct } = resolveRate(rule, referenceRates, input.currency);
  const calculatedFee = calculateBaseFee(rule, amount, effectiveRatePct, chargeDays);
  const finalFee = applyMinimumFee(rule, calculatedFee, chargeDays);
  const lineCore = {
    amount,
    baseRatePct,
    effectiveRatePct,
    chargeDays,
  };

  return {
    sourceType,
    sourceRuleId: rule.issuingBankFeeRuleId ?? rule.id,
    chargeType: rule.chargeType,
    payer: rule.payer,
    startAnchor: rule.startAnchor,
    endAnchor: rule.endAnchor,
    startDay,
    endDay,
    chargeDays,
    amount,
    rateType: rule.rateType,
    fixedRatePct: rule.fixedRatePct,
    baseRateKey: rule.baseRateKey,
    baseRatePct,
    spreadPct: rule.spreadPct,
    effectiveRatePct,
    fixedAmount: rule.fixedAmount,
    dayCountBasis: rule.dayCountBasis,
    minFeeAmount: rule.minFeeAmount,
    minFeeFrequency: rule.minFeeFrequency,
    calculatedFee,
    finalFee,
    formulaText: buildFormulaText(rule, lineCore),
    excelFormulaTemplate: buildExcelFormulaTemplate(rule),
    displayOrder: rule.displayOrder,
  };
}

function resolveChargeDays(
  rule: ChargeRule,
  anchorDays: AnchorDays,
): { startDay: number | null; endDay: number | null; chargeDays: number | null } {
  if (!rule.startAnchor && !rule.endAnchor) {
    return { startDay: null, endDay: null, chargeDays: null };
  }

  if (!rule.startAnchor || !rule.endAnchor) {
    throw new Error(`Charge rule ${rule.id} must define both start and end anchors.`);
  }

  const startDay = anchorDays[rule.startAnchor] + rule.startOffsetDays;
  const endDay = anchorDays[rule.endAnchor] + rule.endOffsetDays;
  const chargeDays = endDay - startDay;

  if (chargeDays < 0) {
    throw new Error(`Charge rule ${rule.id} has negative charge days.`);
  }

  return { startDay, endDay, chargeDays };
}

function calculateBaseFee(
  rule: ChargeRule,
  amount: number,
  effectiveRatePct: number | null,
  chargeDays: number | null,
): number {
  switch (rule.rateType) {
    case 'flat_pct':
      return amount * requireNumber(effectiveRatePct, 'flat_pct requires an effective rate') / 100;
    case 'annual_pct':
    case 'base_plus_spread':
      return amount * requireNumber(effectiveRatePct, `${rule.rateType} requires an effective rate`) / 100 * requireDays(chargeDays, rule.id) / rule.dayCountBasis;
    case 'fixed_amount':
      return requireNumber(rule.fixedAmount, 'fixed_amount requires fixedAmount');
  }
}

function applyMinimumFee(rule: ChargeRule, calculatedFee: number, chargeDays: number | null): number {
  if (rule.minFeeFrequency === 'none' || rule.minFeeAmount == null) {
    return calculatedFee;
  }

  if (rule.minFeeFrequency === 'transaction') {
    return Math.max(calculatedFee, rule.minFeeAmount);
  }

  const months = Math.ceil((chargeDays ?? 0) / 30);
  return Math.max(calculatedFee, rule.minFeeAmount * months);
}

function requireNumber(value: number | null | undefined, message: string): number {
  if (value == null || Number.isNaN(value)) {
    throw new Error(message);
  }

  return value;
}

function requireDays(value: number | null, ruleId: string): number {
  if (value == null) {
    throw new Error(`Charge rule ${ruleId} requires charge days.`);
  }

  return value;
}
