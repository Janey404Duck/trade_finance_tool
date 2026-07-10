import { calculateInputSchema } from '@/lib/validation/calculateSchemas';
import type { AnchorDays, CalculateInput } from './types';

export function resolveAnchorDays(input: CalculateInput): AnchorDays {
  const parsed = calculateInputSchema.parse(input);
  const shipmentDay = parsed.shipmentDaysAfterLcIssue;
  const finalMaturityDay =
    parsed.maturityBasis === 'AFTER_SHIPMENT'
      ? shipmentDay + parsed.maturityDays
      : parsed.maturityDays;

  return {
    LC_ISSUE_DAY: 0,
    SHIPMENT_DAY: shipmentDay,
    DISCOUNT_START_DAY:
      shipmentDay + (parsed.confirmationOptions?.discountStartDaysAfterShipment ?? 0),
    FINAL_MATURITY_DAY: finalMaturityDay,
  };
}
