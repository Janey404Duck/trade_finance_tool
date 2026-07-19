import { z } from 'zod';
import { timelineEventNames } from '@/lib/domain/timeline/model';

const timelineEventNameSchema = z.enum(timelineEventNames);
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

export const pricingRecordSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['instrumentFee', 'confirmationFee', 'discounting', 'forfaiting']),
  condition: z.enum(['always', 'confirmationRequired', 'confirmationNotRequired']),
  rate: z.discriminatedUnion('type', [
    z.object({ type: z.literal('fixedAmount'), amount: z.number().nonnegative() }),
    z.object({ type: z.literal('flatPercentage'), ratePct: z.number().nonnegative() }),
    z.object({ type: z.literal('annualizedPercentage'), ratePct: z.number().nonnegative() }),
    z.object({
      type: z.literal('referencePlusSpread'),
      referenceRateFamily: z.enum(['TERM_SOFR', 'TERM_SHIBOR']),
      spreadPct: z.number(),
    }),
  ]),
  startEvent: timelineEventNameSchema.optional(),
  endEvent: timelineEventNameSchema.optional(),
  dayCountConvention: z.enum(['ACT/360', 'ACT/365', '30/360']).optional(),
  billingFrequency: z.enum(['once', 'monthly', 'quarterly']).optional(),
  partialPeriodRounding: z.enum(['actual', 'up']).optional(),
  minimumPeriodDays: z.number().int().nonnegative().optional(),
  minimumFeeAmount: z.number().nonnegative().optional(),
  includeStartDate: z.boolean().optional(),
  includeEndDate: z.boolean().optional(),
}).superRefine((record, context) => {
  if (
    (record.kind === 'discounting' || record.kind === 'forfaiting') &&
    record.rate.type !== 'referencePlusSpread'
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rate'],
      message: 'Discounting and forfaiting require term reference-rate pricing.',
    });
  }
});

export const quotationSchema = z.object({
  id: z.string().min(1),
  reference: z.string().min(1),
  institution: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['bank', 'tradingHouse', 'broker', 'insuranceCompany', 'other']),
    active: z.boolean(),
  }),
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

export const compareScenarioCommandSchema = z.object({
    amount: z.number().positive(),
    currency: z.string().length(3),
    issuingInstitutionId: z.string().optional(),
    asOfDate: z.string().date(),
    financing: z.object({
      confirmationRequired: z.boolean(),
      discounting: z.boolean(),
      forfaiting: z.boolean(),
    }),
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
    referenceRates: z.array(z.object({
      indexId: z.string().min(1),
      name: z.string().min(1),
      family: z.enum(['TERM_SOFR', 'TERM_SHIBOR']),
      currency: z.string().length(3),
      tenorMonths: z.union([
        z.literal(1),
        z.literal(3),
        z.literal(6),
        z.literal(12),
      ]),
      ratePct: z.number(),
      effectiveDate: z.string().date(),
    })),
  }),
});
