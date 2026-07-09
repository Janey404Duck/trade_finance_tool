import type { ChargeResultLine, ChargeRule } from './types';

export function buildFormulaText(rule: ChargeRule, line: Pick<ChargeResultLine, 'amount' | 'baseRatePct' | 'effectiveRatePct' | 'chargeDays'>): string {
  const amount = formatNumber(line.amount);
  const days = line.chargeDays ?? 0;
  const baseFormula = (() => {
    switch (rule.rateType) {
      case 'flat_pct':
        return `${amount} * ${formatPct(line.effectiveRatePct)}%`;
      case 'annual_pct':
        return `${amount} * ${formatPct(line.effectiveRatePct)}% * ${days} / ${rule.dayCountBasis}`;
      case 'base_plus_spread':
        return `${amount} * (${rule.baseRateKey} ${formatPct(line.baseRatePct)}% + ${formatPct(rule.spreadPct)}%) * ${days} / ${rule.dayCountBasis}`;
      case 'fixed_amount':
        return `${formatNumber(rule.fixedAmount ?? 0)}`;
    }
  })();

  if (rule.minFeeFrequency === 'transaction' && rule.minFeeAmount != null) {
    return `max(${baseFormula}, ${formatNumber(rule.minFeeAmount)})`;
  }

  if (rule.minFeeFrequency === 'month' && rule.minFeeAmount != null) {
    return `max(${baseFormula}, ${formatNumber(rule.minFeeAmount)} * ceil(${days} / 30))`;
  }

  return baseFormula;
}

export function buildExcelFormulaTemplate(rule: ChargeRule): string {
  const baseFormula = (() => {
    switch (rule.rateType) {
      case 'flat_pct':
        return '=AmountCell*RateCell/100';
      case 'annual_pct':
        return '=AmountCell*RateCell/100*DaysCell/DayCountCell';
      case 'base_plus_spread':
        return '=AmountCell*(BaseRateCell+SpreadCell)/100*DaysCell/DayCountCell';
      case 'fixed_amount':
        return '=FixedAmountCell';
    }
  })();

  if (rule.minFeeFrequency === 'transaction' && rule.minFeeAmount != null) {
    return `=MAX(${baseFormula.slice(1)},MinFeeCell)`;
  }

  if (rule.minFeeFrequency === 'month' && rule.minFeeAmount != null) {
    return `=MAX(${baseFormula.slice(1)},MinFeeCell*ROUNDUP(DaysCell/30,0))`;
  }

  return baseFormula;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 6,
  }).format(value);
}

function formatPct(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  }).format(value ?? 0);
}
