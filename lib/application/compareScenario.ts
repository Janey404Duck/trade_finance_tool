import { calculateQuotationCost } from '@/lib/domain/cost/calculateQuotationCost';
import type { QuotationCost, ReferenceRate } from '@/lib/domain/cost/model';
import type { FinancingSelection } from '@/lib/domain/financing/model';
import type { Quotation, QuotationFilter } from '@/lib/domain/quotation/model';
import { selectQuotations } from '@/lib/domain/quotation/selectQuotations';
import type { TradeTimeline } from '@/lib/domain/timeline/model';
import { resolveTimeline } from '@/lib/domain/timeline/resolveTimeline';

export type CompareScenarioCommand = {
  amount: number;
  currency: string;
  issuingInstitutionId?: string;
  asOfDate: string;
  financing: FinancingSelection;
  timeline: TradeTimeline;
  quotationFilter?: QuotationFilter;
};

export type CompareScenarioDependencies = {
  quotations: Quotation[];
  referenceRates: ReferenceRate[];
};

export type Comparison = {
  timeline: ReturnType<typeof resolveTimeline>;
  results: QuotationCost[];
};

export function compareScenario(
  command: CompareScenarioCommand,
  dependencies: CompareScenarioDependencies,
): Comparison {
  if (!Number.isFinite(command.amount) || command.amount <= 0) {
    throw new Error('Transaction amount must be greater than zero.');
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

  const results = selected
    .map(({ quotation, version }) =>
      calculateQuotationCost(quotation, version, {
        amount: command.amount,
        currency: command.currency,
        financing: command.financing,
        timeline,
        referenceRates: dependencies.referenceRates,
      }),
    )
    .sort((a, b) => a.totalCost - b.totalCost);

  return { timeline, results };
}
