import { calculateChargeRule } from './calculateChargeRule';
import { evaluateQuotePackageEligibility } from './quoteEligibility';
import { resolveAnchorDays } from './resolveAnchorDay';
import type {
  CalculateInput,
  CalculationPathResult,
  ChargeResultLine,
  ChargeRule,
  QuoteComponent,
  QuoteComponentType,
  QuotePackage,
  ScenarioData,
  ScenarioResult,
  SolutionPath,
} from './types';

export function calculateScenario(
  input: CalculateInput,
  data: ScenarioData,
  today = new Date(),
): ScenarioResult {
  const assumptions = resolveAnchorDays(input);
  const selectedPackageIds = new Set(input.selectedQuotePackageIds ?? []);
  const quotePackages = selectedPackageIds.size
    ? data.quotePackages.filter((quotePackage) => selectedPackageIds.has(quotePackage.id))
    : data.quotePackages;
  const issuingBankFeeRules = data.issuingBankFeeRules.filter(
    (rule) =>
      rule.active !== false &&
      (!rule.issuingBankId || rule.issuingBankId === input.issuingBankId) &&
      (!rule.currency || rule.currency.toUpperCase() === input.currency.toUpperCase()),
  );

  const results = quotePackages.flatMap((quotePackage) =>
    calculatePackageResults({
      quotePackage,
      input,
      data,
      issuingBankFeeRules,
      today,
      assumptions,
    }),
  );

  return {
    assumptions,
    results: results.sort((a, b) => {
      if (a.eligible !== b.eligible) {
        return a.eligible ? -1 : 1;
      }

      return a.totalCost - b.totalCost;
    }),
  };
}

function calculatePackageResults({
  quotePackage,
  input,
  data,
  issuingBankFeeRules,
  today,
  assumptions,
}: {
  quotePackage: QuotePackage;
  input: CalculateInput;
  data: ScenarioData;
  issuingBankFeeRules: ChargeRule[];
  today: Date;
  assumptions: ReturnType<typeof resolveAnchorDays>;
}): CalculationPathResult[] {
  const eligibility = evaluateQuotePackageEligibility(
    quotePackage,
    input,
    data.quotePackageIssuingBanks,
    today,
  );
  const packageComponents = data.quoteComponents.filter(
    (component) => component.quotePackageId === quotePackage.id && component.active,
  );

  return input.selectedPaths.flatMap((solutionPath) => {
    const pathComponents = selectPathComponents(packageComponents, solutionPath, input);

    if (!eligibility.eligible) {
      return [
        emptyPathResult({
          quotePackage,
          solutionPath,
          includesDiscounting: includesDiscounting(solutionPath, input),
          ineligibilityReason: eligibility.reason,
        }),
      ];
    }

    if (!hasRequiredPathComponent(pathComponents, solutionPath)) {
      return [];
    }

    return [
      calculatePathResult({
        quotePackage,
        solutionPath,
        includesDiscounting: includesDiscounting(solutionPath, input),
        pathComponents,
        data,
        input,
        assumptions,
        issuingBankFeeRules,
      }),
    ];
  });
}

function calculatePathResult({
  quotePackage,
  solutionPath,
  includesDiscounting,
  pathComponents,
  data,
  input,
  assumptions,
  issuingBankFeeRules,
}: {
  quotePackage: QuotePackage;
  solutionPath: SolutionPath;
  includesDiscounting: boolean;
  pathComponents: QuoteComponent[];
  data: ScenarioData;
  input: CalculateInput;
  assumptions: ReturnType<typeof resolveAnchorDays>;
  issuingBankFeeRules: ChargeRule[];
}): CalculationPathResult {
  const componentTypeById = new Map(
    pathComponents.map((component) => [component.id, component.componentType]),
  );
  const quoteLines = data.quoteChargeRules
    .filter(
      (rule) =>
        rule.active !== false &&
        rule.quoteComponentId != null &&
        componentTypeById.has(rule.quoteComponentId),
    )
    .map((rule) => {
      const line = calculateChargeRule({
        rule,
        input,
        anchorDays: assumptions,
        referenceRates: data.referenceRates,
        sourceType: 'quote_charge_rule',
      });

      return {
        ...line,
        quoteComponentId: rule.quoteComponentId,
        componentType: componentTypeById.get(rule.quoteComponentId ?? '') ?? null,
      };
    });
  const issuingBankLines = issuingBankFeeRules.map((rule) =>
    calculateChargeRule({
      rule,
      input,
      anchorDays: assumptions,
      referenceRates: data.referenceRates,
      sourceType: 'issuing_bank_fee_rule',
    }),
  );
  const lines = [...quoteLines, ...issuingBankLines].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  const confirmationCost = sumComponentFees(lines, 'CONFIRMATION');
  const deferredCost = sumComponentFees(lines, 'DEFERRED');
  const discountingCost = sumComponentFees(lines, 'DISCOUNTING');
  const forfaitingCost = sumComponentFees(lines, 'FORFAITING');
  const issuingBankCost = sumFees(issuingBankLines);
  const totalCost =
    confirmationCost + deferredCost + discountingCost + forfaitingCost + issuingBankCost;

  return {
    quotePackageId: quotePackage.id,
    institutionId: quotePackage.institutionId,
    institutionName: quotePackage.institutionName,
    packageName: quotePackage.packageName,
    solutionPath,
    includesDiscounting,
    eligible: true,
    confirmationCost,
    deferredCost,
    discountingCost,
    forfaitingCost,
    issuingBankCost,
    totalCost,
    allInPct: totalCost / input.transactionAmount * 100,
    lines,
  };
}

function selectPathComponents(
  components: QuoteComponent[],
  solutionPath: SolutionPath,
  input: CalculateInput,
): QuoteComponent[] {
  if (solutionPath === 'FORFAITING') {
    return components.filter((component) => component.componentType === 'FORFAITING');
  }

  const allowedTypes: QuoteComponentType[] = ['CONFIRMATION', 'DEFERRED'];

  if (input.confirmationOptions?.includeDiscounting) {
    allowedTypes.push('DISCOUNTING');
  }

  return components.filter((component) => allowedTypes.includes(component.componentType));
}

function hasRequiredPathComponent(components: QuoteComponent[], solutionPath: SolutionPath): boolean {
  const requiredType: QuoteComponentType =
    solutionPath === 'CONFIRMATION' ? 'CONFIRMATION' : 'FORFAITING';

  return components.some((component) => component.componentType === requiredType);
}

function includesDiscounting(solutionPath: SolutionPath, input: CalculateInput): boolean {
  return solutionPath === 'CONFIRMATION' && input.confirmationOptions?.includeDiscounting === true;
}

function emptyPathResult({
  quotePackage,
  solutionPath,
  includesDiscounting,
  ineligibilityReason,
}: {
  quotePackage: QuotePackage;
  solutionPath: SolutionPath;
  includesDiscounting: boolean;
  ineligibilityReason?: string;
}): CalculationPathResult {
  return {
    quotePackageId: quotePackage.id,
    institutionId: quotePackage.institutionId,
    institutionName: quotePackage.institutionName,
    packageName: quotePackage.packageName,
    solutionPath,
    includesDiscounting,
    eligible: false,
    ineligibilityReason,
    confirmationCost: 0,
    deferredCost: 0,
    discountingCost: 0,
    forfaitingCost: 0,
    issuingBankCost: 0,
    totalCost: 0,
    allInPct: 0,
    lines: [],
  };
}

function sumComponentFees(
  lines: ChargeResultLine[],
  componentType: QuoteComponentType,
): number {
  return sumFees(lines.filter((line) => line.componentType === componentType));
}

function sumFees(lines: Array<{ finalFee: number }>): number {
  return lines.reduce((total, line) => total + line.finalFee, 0);
}
