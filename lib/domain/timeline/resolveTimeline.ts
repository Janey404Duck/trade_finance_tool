import {
  TimelineResolutionError,
  type BusinessDayConvention,
  type ResolvedTimeline,
  type ResolvedTimelineEvent,
  type TimelineEventDefinition,
  type TimelineEventName,
  type TradeTimeline,
} from './model';

const DAY_MS = 86_400_000;

export function resolveTimeline(timeline: TradeTimeline): ResolvedTimeline {
  const tradeStart = parseDate(timeline.tradeStartDate, 'trade start');
  const definitions = new Map<TimelineEventName, TimelineEventDefinition>();

  definitions.set('tradeStart', { event: 'tradeStart', mode: 'origin' });
  for (const definition of timeline.events) {
    if (definition.event === 'tradeStart') {
      throw new TimelineResolutionError('Trade start is the canonical origin and cannot be redefined.');
    }
    if (definitions.has(definition.event)) {
      throw new TimelineResolutionError(`Timeline event "${definition.event}" is defined more than once.`);
    }
    definitions.set(definition.event, definition);
  }

  const resolved = new Map<TimelineEventName, ResolvedTimelineEvent>();
  const visiting = new Set<TimelineEventName>();

  const visit = (event: TimelineEventName): ResolvedTimelineEvent => {
    const cached = resolved.get(event);
    if (cached) return cached;
    if (visiting.has(event)) {
      throw new TimelineResolutionError(`Timeline contains a circular dependency at "${event}".`);
    }

    const definition = definitions.get(event);
    if (!definition) {
      throw new TimelineResolutionError(`Timeline event "${event}" is referenced but not defined.`);
    }

    visiting.add(event);
    let result: ResolvedTimelineEvent;
    if (definition.mode === 'origin') {
      result = { event, day: 0, date: toIsoDate(tradeStart), source: 'origin' };
    } else if (definition.mode === 'exact') {
      const exact = adjustBusinessDay(
        parseDate(definition.exactDate, definition.event),
        definition.businessDayConvention ?? 'none',
      );
      result = {
        event,
        day: calendarDayDifference(tradeStart, exact),
        date: toIsoDate(exact),
        source: 'exact',
      };
    } else {
      if (!Number.isInteger(definition.offsetDays)) {
        throw new TimelineResolutionError(`Offset for "${event}" must be a whole number of days.`);
      }
      const anchor = visit(definition.anchor);
      const anchorDate = parseDate(anchor.date, definition.anchor);
      const shifted =
        definition.dayType === 'business'
          ? addBusinessDays(anchorDate, definition.offsetDays)
          : addCalendarDays(anchorDate, definition.offsetDays);
      const adjusted = adjustBusinessDay(
        shifted,
        definition.businessDayConvention ?? 'none',
      );
      result = {
        event,
        day: calendarDayDifference(tradeStart, adjusted),
        date: toIsoDate(adjusted),
        source: 'relative',
      };
    }

    visiting.delete(event);
    resolved.set(event, result);
    return result;
  };

  for (const event of definitions.keys()) visit(event);

  return {
    tradeStartDate: toIsoDate(tradeStart),
    events: Object.fromEntries(resolved) as ResolvedTimeline['events'],
  };
}

function parseDate(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TimelineResolutionError(`Invalid date for "${label}": ${value}.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== value) {
    throw new TimelineResolutionError(`Invalid date for "${label}": ${value}.`);
  }
  return date;
}

function addCalendarDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function addBusinessDays(date: Date, days: number): Date {
  const direction = days < 0 ? -1 : 1;
  let remaining = Math.abs(days);
  let cursor = date;
  while (remaining > 0) {
    cursor = addCalendarDays(cursor, direction);
    if (!isWeekend(cursor)) remaining -= 1;
  }
  return cursor;
}

function adjustBusinessDay(date: Date, convention: BusinessDayConvention): Date {
  if (convention === 'none' || !isWeekend(date)) return date;
  const direction = convention === 'following' ? 1 : -1;
  let cursor = date;
  while (isWeekend(cursor)) cursor = addCalendarDays(cursor, direction);
  return cursor;
}

function isWeekend(date: Date): boolean {
  return date.getUTCDay() === 0 || date.getUTCDay() === 6;
}

function calendarDayDifference(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
