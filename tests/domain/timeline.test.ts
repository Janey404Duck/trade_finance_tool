import { describe, expect, it } from 'vitest';
import {
  TimelineResolutionError,
  type TradeTimeline,
} from '@/lib/domain/timeline/model';
import { resolveTimeline } from '@/lib/domain/timeline/resolveTimeline';
import { standardTimeline } from '../fixtures';

describe('resolveTimeline', () => {
  it('resolves semantic event relationships onto the Day 0 coordinate system', () => {
    const result = resolveTimeline(standardTimeline);

    expect(result.events.tradeStart?.day).toBe(0);
    expect(result.events.lcIssuance?.day).toBe(35);
    expect(result.events.shipment?.day).toBe(45);
    expect(result.events.presentation?.day).toBe(52);
    expect(result.events.acceptance?.day).toBe(57);
    expect(result.events.supplierPayment?.day).toBe(59);
    expect(result.events.lcMaturity?.day).toBe(405);
  });

  it('keeps an exact-date override authoritative when an old anchor moves', () => {
    const base: TradeTimeline = {
      tradeStartDate: '2026-01-01',
      events: [
        { event: 'shipment', mode: 'relative', anchor: 'tradeStart', offsetDays: 45 },
        { event: 'lcIssuance', mode: 'exact', exactDate: '2026-01-20' },
      ],
    };
    const moved: TradeTimeline = {
      ...base,
      events: [
        { event: 'shipment', mode: 'relative', anchor: 'tradeStart', offsetDays: 50 },
        base.events[1],
      ],
    };

    expect(resolveTimeline(base).events.lcIssuance?.date).toBe('2026-01-20');
    expect(resolveTimeline(moved).events.lcIssuance?.date).toBe('2026-01-20');
  });

  it('supports business-day offsets and following adjustment', () => {
    const result = resolveTimeline({
      tradeStartDate: '2026-07-17',
      events: [
        {
          event: 'shipment',
          mode: 'relative',
          anchor: 'tradeStart',
          offsetDays: 1,
          dayType: 'business',
        },
        {
          event: 'lcMaturity',
          mode: 'exact',
          exactDate: '2026-07-19',
          businessDayConvention: 'following',
        },
      ],
    });

    expect(result.events.shipment).toMatchObject({ day: 3, date: '2026-07-20' });
    expect(result.events.lcMaturity).toMatchObject({ day: 3, date: '2026-07-20' });
  });

  it('rejects circular relationships', () => {
    expect(() =>
      resolveTimeline({
        tradeStartDate: '2026-01-01',
        events: [
          { event: 'shipment', mode: 'relative', anchor: 'lcIssuance', offsetDays: 10 },
          { event: 'lcIssuance', mode: 'relative', anchor: 'shipment', offsetDays: -10 },
        ],
      }),
    ).toThrow(TimelineResolutionError);
  });
});
