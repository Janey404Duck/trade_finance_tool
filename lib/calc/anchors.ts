export const ANCHORS = [
  'LC_ISSUE_DAY',
  'SHIPMENT_DAY',
  'DISCOUNT_START_DAY',
  'FINAL_MATURITY_DAY',
] as const;

export type AnchorType = (typeof ANCHORS)[number];
