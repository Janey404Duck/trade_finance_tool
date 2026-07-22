import { z } from 'zod';
import { financingComponents } from '@/lib/domain/financing/model';
import {
  administrativeFeeKinds,
  coreFeeKinds,
  pricingComponentKinds,
} from '@/lib/domain/quotation/model';
import { timelineEventNames } from '@/lib/domain/timeline/model';

const timelineEventNameSchema = z.enum(timelineEventNames);
const financingComponentSchema = z.enum(financingComponents);
const pricingComponentKindSchema = z.enum(pricingComponentKinds);
const administrativeFeeKindSchema = z.enum(administrativeFeeKinds);
const institutionRoleSchema = z.enum([
  'issuingBank',
  'confirmingBank',
  'advisingBank',
  'negotiatingBank',
  'financingProvider',
]);
const relativeEventSchema = z.object({
  event: timelineEventNameSchema.exclude(['tradeStart']),
  mode: z.literal('relative'),
  anchor: timelineEventNameSchema,
  offsetDays: z.number().int(),
  dayType: z.enum(['calendar', 'business']).optional(),
  businessDayConvention: z.enum(['none', 'following', 'preceding']).optional(),
});
const exactEventSchema = z.object({
  event: timelineEventNameSchema.exclude(['tradeStart']),
  mode: z.literal('exact'),
  exactDate: z.string().date(),
  businessDayConvention: z.enum(['none', 'following', 'preceding']).optional(),
});

const institutionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['bank', 'tradingHouse', 'broker', 'insuranceCompany', 'other']),
  active: z.boolean(),
});

const pricingRateSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixedAmount'), amount: z.number().nonnegative() }),
  z.object({ type: z.literal('flatPercentage'), ratePct: z.number().nonnegative() }),
  z.object({ type: z.literal('annualizedPercentage'), ratePct: z.number().nonnegative() }),
  z.object({
    type: z.literal('referencePlusSpread'),
    referenceRateFamily: z.enum(['TERM_SOFR', 'TERM_SHIBOR']),
    spreadPct: z.number(),
  }),
]);

export const tradeTimelineSchema = z.object({
  tradeStartDate: z.string().date(),
  events: z.array(z.discriminatedUnion('mode', [relativeEventSchema, exactEventSchema])),
});

export const comparisonCaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  components: z.array(financingComponentSchema).min(1),
}).superRefine((comparisonCase, context) => {
  if (new Set(comparisonCase.components).size !== comparisonCase.components.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Components must be unique.' });
  }
  if (
    comparisonCase.components.includes('discounting') &&
    comparisonCase.components.includes('forfaiting')
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['components'],
      message: 'Discounting and forfaiting cannot be selected in the same case.',
    });
  }
});

export const pricingRecordSchema = z.object({
  id: z.string().min(1),
  feeCode: z.string().min(1),
  label: z.string().min(1),
  kind: pricingComponentKindSchema,
  disclosureStatus: z.enum(['priced', 'waived', 'notApplicable']),
  inclusionMode: z.enum(['automatic', 'conditional']),
  chargedByInstitutionId: z.string().min(1),
  chargedByRole: institutionRoleSchema,
  requiredComponents: z.array(financingComponentSchema).default([]),
  excludedComponents: z.array(financingComponentSchema).default([]),
  rate: pricingRateSchema.optional(),
  startEvent: timelineEventNameSchema.optional(),
  endEvent: timelineEventNameSchema.optional(),
  dayCountConvention: z.enum(['ACT/360', 'ACT/365', '30/360']).optional(),
  billingFrequency: z.enum(['once', 'monthly', 'quarterly']).optional(),
  partialPeriodRounding: z.enum(['actual', 'up']).optional(),
  minimumPeriodDays: z.number().int().nonnegative().optional(),
  minimumFeeAmount: z.number().nonnegative().optional(),
  includeStartDate: z.boolean().optional(),
  includeEndDate: z.boolean().optional(),
  source: z.enum(['quotation', 'institutionSchedule']).optional(),
  sourceId: z.string().optional(),
}).superRefine((record, context) => {
  if (record.disclosureStatus === 'priced' && !record.rate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rate'], message: 'A priced fee requires a rate.' });
  }
  if (
    record.disclosureStatus === 'priced' &&
    (record.kind === 'discounting' || record.kind === 'forfaiting') &&
    record.rate?.type !== 'referencePlusSpread'
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rate'],
      message: 'Discounting and forfaiting require term reference-rate pricing.',
    });
  }
  if (
    record.inclusionMode === 'conditional' &&
    (coreFeeKinds as readonly string[]).includes(record.kind)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['inclusionMode'], message: 'Core fees cannot be conditional.' });
  }
  if (record.requiredComponents.some((item) => record.excludedComponents.includes(item))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['excludedComponents'], message: 'A component cannot be both required and excluded.' });
  }
});

export const quotationSchema = z.object({
  id: z.string().min(1),
  reference: z.string().min(1),
  institution: institutionSchema,
  currency: z.string().length(3),
  productType: z.literal('lcFinancing'),
  tenorDays: z.number().int().positive().optional(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().optional(),
  issuingInstitutionIds: z.array(z.string()),
  versions: z.array(z.object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    status: z.enum(['draft', 'active', 'superseded', 'withdrawn']),
    validFrom: z.string().date(),
    validTo: z.string().date().optional(),
    pricing: z.array(pricingRecordSchema),
  })),
});

export const institutionFeeScheduleSchema = z.object({
  id: z.string().min(1),
  institution: institutionSchema,
  currency: z.string().length(3),
  role: institutionRoleSchema,
  status: z.enum(['draft', 'active', 'superseded', 'withdrawn']),
  validFrom: z.string().date(),
  validTo: z.string().date().optional(),
  pricing: z.array(pricingRecordSchema),
});

export const compareScenarioCommandSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  issuingInstitutionId: z.string().optional(),
  asOfDate: z.string().date(),
  comparisonMode: z.enum(['coreFeesOnly', 'allAvailableFees']),
  comparisonCases: z.array(comparisonCaseSchema).min(1),
  includedConditionalFeeKinds: z.array(administrativeFeeKindSchema).optional(),
  timeline: tradeTimelineSchema,
  quotationFilter: z.object({
    quotationIds: z.array(z.string()).optional(),
    institutionIds: z.array(z.string()).optional(),
    includeAllApplicable: z.boolean().optional(),
  }).optional(),
});

export const comparisonRequestSchema = z.object({
  command: compareScenarioCommandSchema,
  data: z.object({
    quotations: z.array(quotationSchema),
    institutionFeeSchedules: z.array(institutionFeeScheduleSchema).optional(),
    expectedAdministrativeFeeSlots: z.array(z.object({
      feeCode: z.string().min(1),
      kind: administrativeFeeKindSchema,
      chargedByRole: institutionRoleSchema,
    })).optional(),
    referenceRates: z.array(z.object({
      indexId: z.string().min(1),
      name: z.string().min(1),
      family: z.enum(['TERM_SOFR', 'TERM_SHIBOR']),
      currency: z.string().length(3),
      tenorMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
      ratePct: z.number(),
      effectiveDate: z.string().date(),
    })),
  }),
});
