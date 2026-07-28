import { z } from 'zod';
import { solutionKinds } from '@/lib/domain/financing/model';
import {
  issuingBankFeeKinds,
  nonIssuingFeeKinds,
} from '@/lib/domain/quotation/model';
import { timelineEventNames } from '@/lib/domain/timeline/model';

const solutionKindSchema = z.enum(solutionKinds);
const timelineEventNameSchema = z.enum(timelineEventNames);
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

export const tradeTimelineSchema = z.object({
  tradeStartDate: z.string().date(),
  events: z.array(z.discriminatedUnion('mode', [relativeEventSchema, exactEventSchema])),
});

const feeRecordFields = {
  id: z.string().min(1),
  feeCode: z.string().min(1),
  label: z.string().min(1),
  disclosureStatus: z.enum(['priced', 'waived']),
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
};

export const issuingBankFeeRecordSchema = z.object({
  ...feeRecordFields,
  kind: z.enum(issuingBankFeeKinds),
}).superRefine(validateFeeDisclosure);

export const nonIssuingBankFeeRecordSchema = z.object({
  ...feeRecordFields,
  kind: z.enum(nonIssuingFeeKinds),
  applicableSolutions: z.array(solutionKindSchema).min(1),
}).superRefine(validateFeeDisclosure).superRefine((record, context) => {
  if (new Set(record.applicableSolutions).size !== record.applicableSolutions.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['applicableSolutions'],
      message: 'Applicable solutions must be unique.',
    });
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
});

function validateFeeDisclosure(
  record: { disclosureStatus: 'priced' | 'waived'; rate?: unknown },
  context: z.RefinementCtx,
): void {
  if (record.disclosureStatus === 'priced' && !record.rate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rate'],
      message: 'A priced fee requires a rate.',
    });
  }
  if (record.disclosureStatus !== 'priced' && record.rate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rate'],
      message: 'A waived fee cannot have a rate.',
    });
  }
}

const quotationFields = {
  id: z.string().min(1),
  reference: z.string().min(1),
  institution: institutionSchema,
  currency: z.string().length(3),
  tenorDays: z.number().int().positive().optional(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().optional(),
};

export const issuingBankQuotationSchema = z.object({
  ...quotationFields,
  productType: z.literal('issuingBankFees'),
  versions: z.array(z.object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    status: z.enum(['draft', 'active', 'superseded', 'withdrawn']),
    validFrom: z.string().date(),
    validTo: z.string().date().optional(),
    pricing: z.array(issuingBankFeeRecordSchema),
  })),
});

export const nonIssuingBankQuotationSchema = z.object({
  ...quotationFields,
  productType: z.literal('lcFinancing'),
  issuingInstitutionIds: z.array(z.string()),
  versions: z.array(z.object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    status: z.enum(['draft', 'active', 'superseded', 'withdrawn']),
    validFrom: z.string().date(),
    validTo: z.string().date().optional(),
    pricing: z.array(nonIssuingBankFeeRecordSchema),
  })),
});

const nonIssuingSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({
    mode: z.literal('institutions'),
    institutionIds: z.array(z.string().min(1)).min(1).refine(uniqueValues, {
      message: 'Institution selections must be unique.',
    }),
  }),
  z.object({
    mode: z.literal('quotations'),
    quotationIds: z.array(z.string().min(1)).min(1).refine(uniqueValues, {
      message: 'Quotation selections must be unique.',
    }),
  }),
]);

export const compareScenarioCommandSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  issuingInstitutionId: z.string().min(1),
  asOfDate: z.string().date(),
  comparisonMode: z.enum(['coreFeesOnly', 'allAvailableFees']),
  solutions: z.array(solutionKindSchema).min(1),
  nonIssuingSelection: nonIssuingSelectionSchema,
  timeline: tradeTimelineSchema,
}).superRefine((command, context) => {
  if (new Set(command.solutions).size !== command.solutions.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['solutions'],
      message: 'Solutions must be unique.',
    });
  }
});

export const comparisonRequestSchema = z.object({
  command: compareScenarioCommandSchema,
  data: z.object({
    issuingBankQuotations: z.array(issuingBankQuotationSchema),
    nonIssuingBankQuotations: z.array(nonIssuingBankQuotationSchema),
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

function uniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length;
}
