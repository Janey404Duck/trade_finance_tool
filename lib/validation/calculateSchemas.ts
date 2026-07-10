import { z } from 'zod';

export const solutionPathSchema = z.enum(['CONFIRMATION', 'FORFAITING']);

export const maturityBasisSchema = z.enum(['AFTER_SHIPMENT', 'AFTER_LC_ISSUANCE']);

export const calculateInputSchema = z
  .object({
    issuingBankId: z.string().uuid(),
    currency: z.string().trim().min(1).transform((value) => value.toUpperCase()),
    transactionAmount: z.coerce.number().positive(),
    shipmentDaysAfterLcIssue: z.coerce.number().int().min(0),
    maturityBasis: maturityBasisSchema,
    maturityDays: z.coerce.number().int().positive(),
    selectedPaths: z.array(solutionPathSchema).min(1),
    confirmationOptions: z
      .object({
        includeDiscounting: z.boolean(),
        discountStartDaysAfterShipment: z.coerce.number().int().min(0).optional(),
      })
      .optional(),
    selectedQuotePackageIds: z.array(z.string().uuid()).optional(),
  })
  .superRefine((value, ctx) => {
    const shipmentDay = value.shipmentDaysAfterLcIssue;
    const finalMaturityDay =
      value.maturityBasis === 'AFTER_SHIPMENT'
        ? shipmentDay + value.maturityDays
        : value.maturityDays;

    if (finalMaturityDay < shipmentDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Final maturity day cannot be before shipment day.',
        path: ['maturityDays'],
      });
    }

    if (
      value.selectedPaths.includes('CONFIRMATION') &&
      value.confirmationOptions?.includeDiscounting
    ) {
      const discountStartDay =
        shipmentDay + (value.confirmationOptions.discountStartDaysAfterShipment ?? 0);

      if (discountStartDay > finalMaturityDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Discount start day cannot be after final maturity day.',
          path: ['confirmationOptions', 'discountStartDaysAfterShipment'],
        });
      }
    }
  });

export type CalculateInputSchema = z.infer<typeof calculateInputSchema>;
