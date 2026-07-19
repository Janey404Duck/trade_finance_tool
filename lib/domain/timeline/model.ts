export const timelineEventNames = [
  'tradeStart',
  'purchaseOrder',
  'lcIssuance',
  'shipment',
  'invoice',
  'presentation',
  'acceptance',
  'supplierPayment',
  'negotiation',
  'lcMaturity',
] as const;

export type TimelineEventName = (typeof timelineEventNames)[number];
export type DayType = 'calendar' | 'business';
export type BusinessDayConvention = 'none' | 'following' | 'preceding';

export type OriginEvent = {
  event: 'tradeStart';
  mode: 'origin';
};

export type RelativeEvent = {
  event: Exclude<TimelineEventName, 'tradeStart'>;
  mode: 'relative';
  anchor: TimelineEventName;
  offsetDays: number;
  dayType?: DayType;
  businessDayConvention?: BusinessDayConvention;
};

export type ExactDateEvent = {
  event: Exclude<TimelineEventName, 'tradeStart'>;
  mode: 'exact';
  exactDate: string;
  businessDayConvention?: BusinessDayConvention;
};

export type TimelineEventDefinition = OriginEvent | RelativeEvent | ExactDateEvent;

export type TradeTimeline = {
  tradeStartDate: string;
  events: TimelineEventDefinition[];
};

export type ResolvedTimelineEvent = {
  event: TimelineEventName;
  day: number;
  date: string;
  source: 'origin' | 'relative' | 'exact';
};

export type ResolvedTimeline = {
  tradeStartDate: string;
  events: Partial<Record<TimelineEventName, ResolvedTimelineEvent>>;
};

export class TimelineResolutionError extends Error {}
