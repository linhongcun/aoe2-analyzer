import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs has no declaration
import { planChanges } from '../../scripts/ci-scope.mjs';
import SuddenDessasterWatch from '../../src/features/maps/SuddenDessasterWatch';
import { SD3_SOURCE, SD3_WATCH_CHECKED_AT, SD3_WATCH_ENDS_AT, SD3_WATCH_ROWS, sd3WatchPhase } from '../../src/features/maps/sd3Watch';

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);

const wallClock = (iso: string, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
};

describe('#702 观赛窗口只对照固定时刻', () => {
  it('半决赛与决赛的上海时间和 UTC 与锁定时刻一致', () => {
    expect(SD3_SOURCE).toBe('https://www.twestaoe.net/events/suddendessaster3');
    expect(SD3_WATCH_CHECKED_AT).toBe('2026-11-06');
    expect(SD3_WATCH_ENDS_AT).toBe('2026-11-09T00:00:00.000Z');
    expect(SD3_WATCH_ROWS.map((row) => row.label)).toEqual(['半决赛', '决赛']);
    for (const row of SD3_WATCH_ROWS) {
      expect(row.shanghai).toBe(wallClock(row.utc, 'Asia/Shanghai'));
      expect(row.utcText).toBe(wallClock(row.utc, 'UTC'));
    }
    expect(SD3_WATCH_ROWS[0]).toMatchObject({ shanghai: '2026-11-07 23:00', utcText: '2026-11-07 15:00' });
    expect(SD3_WATCH_ROWS[1]).toMatchObject({ shanghai: '2026-11-09 01:00', utcText: '2026-11-08 17:00' });
  });

  it('决赛开打时窗口仍开放，UTC 11 月 8 日一过就结束', () => {
    expect(sd3WatchPhase(new Date('2026-11-06T12:00:00.000Z'))).toBe('open');
    expect(sd3WatchPhase(new Date('2026-11-07T15:00:00.000Z'))).toBe('open');
    expect(sd3WatchPhase(new Date('2026-11-08T17:00:00.000Z'))).toBe('open');
    expect(sd3WatchPhase(new Date(Date.parse(SD3_WATCH_ENDS_AT) - 1))).toBe('open');
    expect(sd3WatchPhase(new Date(SD3_WATCH_ENDS_AT))).toBe('ended');
    expect(sd3WatchPhase(new Date('2026-11-10T00:00:00.000Z'))).toBe('ended');
  });

  it('时钟读不出来时按已结束处理，避免显示成仍可观看', () => {
    expect(sd3WatchPhase(new Date(Number.NaN))).toBe('ended');
    expect(sd3WatchPhase(new Date('not-a-date'))).toBe('ended');
  });
});

describe('#702 两种界面', () => {
  const render = (iso: string) => renderToStaticMarkup(createElement(SuddenDessasterWatch, { now: new Date(iso) }));

  it('开放时同时写出 Asia/Shanghai 和 UTC，只有赛事页链接', () => {
    const html = render('2026-11-06T12:00:00.000Z');
    const visible = text(html);
    expect(html).toContain('data-state="open"');
    expect(html).not.toContain('<details');
    expect(visible).toContain('半决赛');
    expect(visible).toContain('决赛');
    expect(visible).toContain('Asia/Shanghai');
    expect(visible).toContain('2026-11-07 23:00');
    expect(visible).toContain('2026-11-09 01:00');
    expect(visible).toContain('UTC');
    expect(visible).toContain('2026-11-07 15:00');
    expect(visible).toContain('2026-11-08 17:00');
    expect(visible).toContain('本站没有直播');
    expect(visible).not.toMatch(/必胜|直播中|正在直播|must-win|比分/);
    expect(hrefs(html)).toEqual(['https://www.twestaoe.net/events/suddendessaster3']);
  });

  it('到期后默认收起，并写明本届已结束', () => {
    const html = render(SD3_WATCH_ENDS_AT);
    const visible = text(html);
    expect(html).toContain('data-state="ended"');
    expect(html).toContain('<details');
    expect(html).not.toMatch(/<details[^>]*\sopen[\s>]/);
    expect(visible).toContain('本届已结束');
    expect(visible).not.toMatch(/必胜|直播中|正在直播|must-win|比分/);
    expect(hrefs(html)).toEqual(['https://www.twestaoe.net/events/suddendessaster3']);
    expect(html).not.toContain('data-state="open"');
  });
});

describe('#702 地图范围登记', () => {
  it('只改观赛组件时仍跑本窗口的单测和浏览器用例', () => {
    const plan = planChanges([{ path: 'src/features/maps/SuddenDessasterWatch.tsx', before: '', after: 'export {}' }]);
    expect(plan).toMatchObject({ scope: 'targeted', features: ['maps'], full: false, data: false });
    expect(plan.unit).toContain('tests/unit/sd3Watch702.test.ts');
    expect(plan.e2e).toContain('tests/e2e/sd3Watch702.spec.ts');
    expect(plan.e2e).toContain('tests/e2e/mapCatalog422.spec.ts');
  });
});
