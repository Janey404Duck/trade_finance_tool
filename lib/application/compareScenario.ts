import { calculateIssuingQuotationCost } from '@/lib/domain/cost/calculateIssuingQuotationCost';
import { calculateNonIssuingQuotationCost } from '@/lib/domain/cost/calculateNonIssuingQuotationCost';
import type {
  CombinedQuotationCost,
  IssuingBankQuotationCost,
  MissingFeeIssue,
  ReferenceRate,
} from '@/lib/domain/cost/model';
import { solutionLabels, type SolutionKind } from '@/lib/domain/financing/model';
import type {
  ComparisonMode,
  IssuingBankQuotation,
  NonIssuingBankQuotation,
  NonIssuingCoreFeeKind,
  NonIssuingQuotationSelection,
  SelectedIssuingBankQuotation,
  SelectedNonIssuingBankQuotation,
} from '@/lib/domain/quotation/model';
import {
  findMissingIssuingCorePricing,
  findMissingNonIssuingAdministrativeFees,
  findMissingNonIssuingCorePricing,
} from '@/lib/domain/quotation/pricingCoverage';
import {
  resolveIssuingBankQuotation,
  selectNonIssuingBankQuotations,
} from '@/lib/domain/quotation/selectQuotations';
import type { TradeTimeline } from '@/lib/domain/timeline/model';
import { resolveTimeline } from '@/lib/domain/timeline/resolveTimeline';

export type CompareScenarioCommand = {
  amount: number;
  currency: string;
  issuingInstitutionId: string;
  asOfDate: string;
  comparisonMode: ComparisonMode;
  solutions: SolutionKind[];
  nonIssuingSelection: NonIssuingQuotationSelection;
  timeline: TradeTimeline;
};

export type CompareScenarioDependencies = {
  issuingBankQuotations: IssuingBankQuotation[];
  nonIssuingBankQuotations: NonIssuingBankQuotation[];
  referenceRates: ReferenceRate[];
};

export type IneligibleComparisonResult = {
  eligible: false;
  solution: SolutionKind;
  solutionLabel: string;
  issuingQuotationId: string;
  issuingQuotationReference: string;
  issuingQuotationVersionId: string;
  nonIssuingQuotationId: string;
  nonIssuingQuotationReference: string;
  nonIssuingQuotationVersionId: string;
  nonIssuingInstitutionId: string;
  nonIssuingInstitutionName: string;
  missingCoreFees: NonIssuingCoreFeeKind[];
};

export type EligibleComparisonResult = CombinedQuotationCost & {
  eligible: true;
  solutionLabel: string;
};

export type ComparisonResult = EligibleComparisonResult | IneligibleComparisonResult;

export type IssuingBankComparisonSummary = {
  cost: IssuingBankQuotationCost;
  coverageStatus: 'complete' | 'incomplete';
  missingFees: MissingFeeIssue[];
};

export type Comparison = {
  timeline: ReturnType<typeof resolveTimeline>;
  issuingBank: IssuingBankComparisonSummary;
  results: ComparisonResult[];
};

export function compareScenario(
  command: CompareScenarioCommand,
  dependencies: CompareScenarioDependencies,
): Comparison {
  validateCommand(command);
  const timeline = resolveTimeline(command.timeline);
  const maturity = timeline.events.lcMaturity;
  if (!maturity) throw new Error('LC maturity must be defined for a comparison.');
  const maturityDays = maturity.day - (timeline.events.lcIssuance?.day ?? 0);
  const applicability = {
    amount: command.amount,
    currency: command.currency,
    issuingInstitutionId: command.issuingInstitutionId,
    asOfDate: command.asOfDate,
    maturityDays,
  };
  const issuing = resolveIssuingBankQuotation(
    dependencies.issuingBankQuotations,
    applicability,
  );
  const missingIssuingCore = findMissingIssuingCorePricing(issuing.version.pricing);
  if (missingIssuingCore.length > 0) {
    throw new Error(
      `Issuing quotation "${issuing.quotation.reference}" is missing issuingFee.`,
    );
  }
  const selectedNonIssuing = selectNonIssuingBankQuotations(
    dependencies.nonIssuingBankQuotations,
    applicability,
    command.nonIssuingSelection,
  );
  const feeContext = {
    amount: command.amount,
    currency: command.currency,
    timeline,
    referenceRates: dependencies.referenceRates,
  };
  const issuingCost = calculateIssuingQuotationCost(
    issuing.quotation,
    issuing.version,
    command.comparisonMode,
    feeContext,
  );
  const issuingMissingFees = resolveIssuingMissingFees(
    issuing,
    command.comparisonMode,
  );

  const results = command.solutions.flatMap((solution) =>
    selectedNonIssuing
      .map((selected) =>
        calculateResult(
          solution,
          selected,
          issuing,
          issuingCost,
          issuingMissingFees,
          command,
          feeContext,
        ),
      ),
  ).sort(compareResults);

  return {
    timeline,
    issuingBank: {
      cost: issuingCost,
      coverageStatus: issuingMissingFees.length === 0 ? 'complete' : 'incomplete',
      missingFees: issuingMissingFees,
    },
    results,
  };
}

function validateCommand(command: CompareScenarioCommand): void {
  if (!Number.isFinite(command.amount) || command.amount <= 0) {
    throw new Error('Transaction amount must be greater than zero.');
  }
  if (!command.issuingInstitutionId.trim()) {
    throw new Error('Select one issuing bank.');
  }
  if (command.solutions.length === 0) {
    throw new Error('Select at least one solution.');
  }
  if (new Set(command.solutions).size !== command.solutions.length) {
    throw new Error('Selected solutions must be unique.');
  }
}

function calculateResult(
  solution: SolutionKind,
  selected: SelectedNonIssuingBankQuotation,
  issuing: SelectedIssuingBankQuotation,
  issuingCost: IssuingBankQuotationCost,
  issuingMissingFees: MissingFeeIssue[],
  command: CompareScenarioCommand,
  feeContext: Parameters<typeof calculateNonIssuingQuotationCost>[4],
): ComparisonResult {
  const missingCoreFees = findMissingNonIssuingCorePricing(
    selected.version.pricing,
    solution,
  );
  if (missingCoreFees.length > 0) {
    return {
      eligible: false,
      solution,
      solutionLabel: solutionLabels[solution],
      issuingQuotationId: issuing.quotation.id,
      issuingQuotationReference: issuing.quotation.reference,
      issuingQuotationVersionId: issuing.version.id,
      nonIssuingQuotationId: selected.quotation.id,
      nonIssuingQuotationReference: selected.quotation.reference,
      nonIssuingQuotationVersionId: selected.version.id,
      nonIssuingInstitutionId: selected.quotation.institution.id,
      nonIssuingInstitutionName: selected.quotation.institution.name,
      missingCoreFees,
    };
  }

  const nonIssuingCost = calculateNonIssuingQuotationCost(
    selected.quotation,
    selected.version,
    solution,
    command.comparisonMode,
    feeContext,
  );
  const missingFees = [
    ...issuingMissingFees,
    ...resolveNonIssuingMissingFees(selected, solution, command.comparisonMode),
  ];
  const coreCost = issuingCost.coreCost + nonIssuingCost.coreCost;
  const administrativeCost =
    issuingCost.administrativeCost + nonIssuingCost.administrativeCost;
  const totalCost = coreCost + administrativeCost;
  return {
    eligible: true,
    solution,
    solutionLabel: solutionLabels[solution],
    comparisonMode: command.comparisonMode,
    currency: command.currency,
    amount: command.amount,
    issuingBankCost: issuingCost,
    nonIssuingBankCost: nonIssuingCost,
    lines: [...issuingCost.lines, ...nonIssuingCost.lines],
    coreCost,
    administrativeCost,
    totalCost,
    allInPct: totalCost / command.amount * 100,
    coverageStatus: missingFees.length === 0 ? 'complete' : 'incomplete',
    missingFees,
  };
}

function resolveIssuingMissingFees(
  selected: SelectedIssuingBankQuotation,
  mode: ComparisonMode,
): MissingFeeIssue[] {
  if (
    mode === 'coreFeesOnly' ||
    selected.version.pricing.some((record) => record.kind === 'swiftFee')
  ) {
    return [];
  }
  return [{
    quotationSide: 'issuingBank',
    institutionId: selected.quotation.institution.id,
    institutionName: selected.quotation.institution.name,
    quotationId: selected.quotation.id,
    quotationReference: selected.quotation.reference,
    quotationVersionId: selected.version.id,
    feeKind: 'swiftFee',
  }];
}

function resolveNonIssuingMissingFees(
  selected: SelectedNonIssuingBankQuotation,
  solution: SolutionKind,
  mode: ComparisonMode,
): MissingFeeIssue[] {
  if (mode === 'coreFeesOnly') return [];
  return findMissingNonIssuingAdministrativeFees(
    selected.version.pricing,
    solution,
  ).map((feeKind) => ({
    quotationSide: 'nonIssuingBank' as const,
    institutionId: selected.quotation.institution.id,
    institutionName: selected.quotation.institution.name,
    quotationId: selected.quotation.id,
    quotationReference: selected.quotation.reference,
    quotationVersionId: selected.version.id,
    solution,
    feeKind,
  }));
}

function compareResults(a: ComparisonResult, b: ComparisonResult): number {
  const rank = (result: ComparisonResult) =>
    !result.eligible ? 2 : result.coverageStatus === 'complete' ? 0 : 1;
  const rankDifference = rank(a) - rank(b);
  if (rankDifference !== 0) return rankDifference;
  if (a.eligible && b.eligible) return a.totalCost - b.totalCost;
  const reference = (result: ComparisonResult) =>
    result.eligible
      ? result.nonIssuingBankCost.quotationReference
      : result.nonIssuingQuotationReference;
  return reference(a).localeCompare(reference(b));
}
