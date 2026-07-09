import { calculateInputSchema } from '@/lib/validation/calculateSchemas';
import type { AnchorDays, CalculateInput } from './types';

export function resolveAnchorDays(input: CalculateInput): AnchorDays {
  const parsed = calculateInputSchema.parse(input);

  return {
    LC_ISSUE_DAY: 0,
    SHIPMENT_DAY: parsed.shipmentDays,
    SUPPLIER_PAYMENT_DAY: parsed.shipmentDays + parsed.paymentTermsDays,
    FINAL_MATURITY_DAY: parsed.shipmentDays + parsed.lcMaturityDays,
  };
}
