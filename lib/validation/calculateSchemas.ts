import { z } from 'zod';

export const calculateInputSchema = z
  .object({
    issuingBankId: z.string().uuid(),
    currency: z.string().trim().min(1).transform((value) => value.toUpperCase()),
    transactionAmount: z.coerce.number().positive(),
    lcMaturityDays: z.coerce.number().int().positive(),
    shipmentDays: z.coerce.number().int().min(0),
    paymentTermsDays: z.coerce.number().int().min(0),
    selectedQuoteIds: z.array(z.string().uuid()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.paymentTermsDays > value.lcMaturityDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Supplier payment day cannot be after final maturity day.',
        path: ['paymentTermsDays'],
      });
    }
  });

export type CalculateInputSchema = z.infer<typeof calculateInputSchema>;
