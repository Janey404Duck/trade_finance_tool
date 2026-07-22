import { calculateQuotationCost } from '@/lib/domain/cost/calculateQuotationCost';
import type { QuotationCost, ReferenceRate } from '@/lib/domain/cost/model';
import {
  assertValidComparisonCase,
  type ComparisonCase,
} from '@/lib/domain/financing/model';
import type {
  AdministrativeFeeKind,
  ComparisonMode,
  FeeCoverageSlot,
  InstitutionFeeSchedule,
  PricingRecord,
  Quotation,
  QuotationFilter,
  SelectedQuotation,
} from '@/lib/domain/quotation/model';
import {
  feeSlotKey,
  isAdministrativeFeeKind,
  pricingRecordApplies,
} from '@/lib/domain/quotation/model';
import { findMissingPricingCoverage } from '@/lib/domain/quotation/pricingCoverage';
import { selectQuotations } from '@/lib/domain/quotation/selectQuotations';
import type { TradeTimeline } from '@/lib/domain/timeline/model';
import { resolveTimeline } from '@/lib/domain/timeline/resolveTimeline';

export type CompareScenarioCommand = {
  amount: number;
  currency: string;
  issuingInstitutionId?: string;
  asOfDate: string;
  comparisonMode: ComparisonMode;
  comparisonCases: ComparisonCase[];
  includedConditionalFeeKinds?: AdministrativeFeeKind[];
  timeline: TradeTimeline;
  quotationFilter?: QuotationFilter;
};

export type CompareScenarioDependencies = {
  quotations: Quotation[];
  referenceRates: ReferenceRate[];
  institutionFeeSchedules?: InstitutionFeeSchedule[];
  expectedAdministrativeFeeSlots?: FeeCoverageSlot[];
};

export type IneligibleComparisonResult = {
  eligible: false;
  quotationId: string;
  quotationReference: string;
  quotationVersionId: string;
  institutionId: string;
  institutionName: string;
  comparisonCaseId: string;
  comparisonCaseLabel: string;
  selectedComponents: ComparisonCase['components'];
  reasons: string[];
};

export type EligibleComparisonResult = QuotationCost & { eligible: true };
export type ComparisonResult = EligibleComparisonResult | IneligibleComparisonResult;

export type Comparison = {
  timeline: ReturnType<typeof resolveTimeline>;
  results: ComparisonResult[];
};

type Candidate = SelectedQuotation & { pricing: PricingRecord[] };

export function compareScenario(
  command: CompareScenarioCommand,
  dependencies: CompareScenarioDependencies,
): Comparison {
  if (!Number.isFinite(command.amount) || command.amount <= 0) {
    throw new Error('Transaction amount must be greater than zero.');
  }
  if (command.comparisonCases.length === 0) {
    throw new Error('Select at least one comparison case.');
  }
  const caseIds = new Set<string>();
  for (const comparisonCase of command.comparisonCases) {
    assertValidComparisonCase(comparisonCase);
    if (caseIds.has(comparisonCase.id)) {
      throw new Error(`Comparison case id "${comparisonCase.id}" is duplicated.`);
    }
    caseIds.add(comparisonCase.id);
  }

  const timeline = resolveTimeline(command.timeline);
  const maturity = timeline.events.lcMaturity;
  if (!maturity) throw new Error('LC maturity must be defined for a comparison.');
  const lcIssuance = timeline.events.lcIssuance;
  const maturityDays = maturity.day - (lcIssuance?.day ?? 0);

  const selected = selectQuotations(
    dependencies.quotations,
    {
      amount: command.amount,
      currency: command.currency,
      maturityDays,
      issuingInstitutionId: command.issuingInstitutionId,
      asOfDate: command.asOfDate,
    },
    command.quotationFilter,
  );
  const candidates = selected.map((item) => ({
    ...item,
    pricing: mergePricing(
      item,
      command,
      dependencies.institutionFeeSchedules ?? [],
    ),
  }));

  const results = command.comparisonCases.flatMap((comparisonCase) => {
    const expectedSlots = resolveExpectedAdministrativeSlots(
      candidates,
      comparisonCase,
      command,
      dependencies.expectedAdministrativeFeeSlots ?? [],
    );
    const caseResults = candidates.map((candidate): ComparisonResult => {
      const missing = findMissingPricingCoverage(candidate.pricing, comparisonCase);
      if (missing.length > 0) {
        return {
          eligible: false,
          quotationId: candidate.quotation.id,
          quotationReference: candidate.quotation.reference,
          quotationVersionId: candidate.version.id,
          institutionId: candidate.quotation.institution.id,
          institutionName: candidate.quotation.institution.name,
          comparisonCaseId: comparisonCase.id,
          comparisonCaseLabel: comparisonCase.label,
          selectedComponents: comparisonCase.components,
          reasons: missing,
        };
      }

      return {
        eligible: true,
        ...calculateQuotationCost(
          candidate.quotation,
          candidate.version,
          {
            amount: command.amount,
            currency: command.currency,
            comparisonCase,
            comparisonMode: command.comparisonMode,
            includedConditionalFeeKinds: command.includedConditionalFeeKinds,
            expectedAdministrativeFeeSlots: expectedSlots,
            timeline,
            referenceRates: dependencies.referenceRates,
          },
          candidate.pricing,
        ),
      };
    });
    return caseResults.sort(compareResults);
  });

  return { timeline, results };
}

function compareResults(a: ComparisonResult, b: ComparisonResult): number {
  const rank = (result: ComparisonResult) =>
    !result.eligible ? 2 : result.coverageStatus === 'complete' ? 0 : 1;
  const rankDifference = rank(a) - rank(b);
  if (rankDifference !== 0) return rankDifference;
  if (a.eligible && b.eligible) return a.totalCost - b.totalCost;
  return a.quotationReference.localeCompare(b.quotationReference);
}

function mergePricing(
  selected: SelectedQuotation,
  command: CompareScenarioCommand,
  schedules: InstitutionFeeSchedule[],
): PricingRecord[] {
  const applicableSchedulePricing = schedules
    .filter((schedule) => scheduleApplies(schedule, selected, command))
    .flatMap((schedule) =>
      schedule.pricing.map((record) => ({
        ...record,
        source: 'institutionSchedule' as const,
        sourceId: schedule.id,
      })),
    );
  const quotePricing = selected.version.pricing.map((record) => ({
    ...record,
    source: 'quotation' as const,
    sourceId: selected.version.id,
  }));

  const merged = new Map<string, PricingRecord>();
  for (const record of applicableSchedulePricing) merged.set(pricingKey(record), record);
  for (const record of quotePricing) merged.set(pricingKey(record), record);
  return [...merged.values()];
}

function scheduleApplies(
  schedule: InstitutionFeeSchedule,
  selected: SelectedQuotation,
  command: CompareScenarioCommand,
): boolean {
  if (
    !schedule.institution.active ||
    schedule.status !== 'active' ||
    schedule.currency.toUpperCase() !== command.currency.toUpperCase() ||
    schedule.validFrom > command.asOfDate ||
    (schedule.validTo != null && schedule.validTo < command.asOfDate)
  ) {
    return false;
  }
  if (schedule.role === 'issuingBank') {
    return schedule.institution.id === command.issuingInstitutionId;
  }
  return schedule.institution.id === selected.quotation.institution.id;
}

function pricingKey(record: PricingRecord): string {
  return `${record.feeCode}:${record.chargedByRole}`;
}

function resolveExpectedAdministrativeSlots(
  candidates: Candidate[],
  comparisonCase: ComparisonCase,
  command: CompareScenarioCommand,
  configuredSlots: FeeCoverageSlot[],
): FeeCoverageSlot[] {
  if (command.comparisonMode === 'coreFeesOnly') return [];
  const slots = new Map(configuredSlots.map((slot) => [feeSlotKey(slot), slot]));
  for (const { pricing } of candidates) {
    for (const record of pricing) {
      if (
        !isAdministrativeFeeKind(record.kind) ||
        !pricingRecordApplies(record, comparisonCase) ||
        (record.inclusionMode === 'conditional' &&
          !(command.includedConditionalFeeKinds ?? []).includes(record.kind))
      ) {
        continue;
      }
      const slot = {
        feeCode: record.feeCode,
        kind: record.kind,
        chargedByRole: record.chargedByRole,
      };
      slots.set(feeSlotKey(slot), slot);
    }
  }
  return [...slots.values()];
}
