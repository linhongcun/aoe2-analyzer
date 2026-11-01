import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { LadderFreshness } from '../../src/features/ladder/LadderFreshness';
import {
  SAMPLE_UNLISTED,
  freshnessText,
  isBalanceAligned,
  isPatchMismatch,
  relativeFreshness,
  sampleGames,
  snapshotCutoff,
  type LadderSnapshot,
} from '../../src/domain/ladder';

const arabia = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const team = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as LadderSnapshot;
const FORBIDDEN = /实时|秒前|分钟前|刚刚|自动更新|今日更新|最新排名|近实时/;

describe('天梯相对新鲜度与样本量 #569', () => {
  it('只有日期时按本机日历算天，当天不写成小时', () => {
    const morning = new Date(2026, 10, 1, 9, 0, 0);
    const evening = new Date(2026, 10, 1, 23, 59, 0);
    expect(freshnessText(relativeFreshness('2026-11-01', morning))).toBe('更新于今天');
    expect(freshnessText(relativeFreshness('2026-11-01', evening))).toBe('更新于今天');
    expect(freshnessText(relativeFreshness('2026-10-31', morning))).toBe('更新于 1 天前');
    expect(freshnessText(relativeFreshness('2026-10-18', morning))).toBe('更新于 14 天前');
  });

  it('带时间才分小时，不满 1 小时不写分钟或秒', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    expect(freshnessText(relativeFreshness('2026-11-15T11:20:00Z', now))).toBe('更新于不到 1 小时');
    expect(freshnessText(relativeFreshness('2026-11-15T11:00:00Z', now))).toBe('更新于 1 小时前');
    expect(freshnessText(relativeFreshness('2026-11-15T09:00:00Z', now))).toBe('更新于 3 小时前');
    expect(freshnessText(relativeFreshness('2026-11-14T12:00:00Z', now))).toBe('更新于 1 天前');
    expect(freshnessText(relativeFreshness('2026-11-14T11:00:00Z', now))).toBe('更新于 1 天前');
  });

  it('未来日期、坏日期都不编「刚刚」', () => {
    const now = new Date(2026, 10, 1, 12, 0, 0);
    expect(freshnessText(relativeFreshness('2026-11-02', now))).toBe('更新日晚于本机');
    expect(freshnessText(relativeFreshness('2026-02-31', now))).toBe('更新时间未收录');
    expect(freshnessText(relativeFreshness('', now))).toBe('更新时间未收录');
    expect(freshnessText(relativeFreshness('昨天', now))).toBe('更新时间未收录');
    for (const text of ['更新于今天', '更新于 3 小时前', '更新于 14 天前', '更新于不到 1 小时', '更新日晚于本机', '更新时间未收录']) {
      expect(text).not.toMatch(FORBIDDEN);
    }
  });

  it('样本量缺字段时用占位，0 仍算收录', () => {
    expect(sampleGames(undefined)).toBeNull();
    expect(sampleGames(null)).toBeNull();
    expect(sampleGames(Number.NaN)).toBeNull();
    expect(sampleGames(0)).toBe(0);
    expect(SAMPLE_UNLISTED).toBe('样本未收录');
    expect(sampleGames(arabia.brackets.find((bracket) => bracket.key === 'all')?.games)).toBe(114500);
    expect(sampleGames(team.brackets[0]?.games)).toBe(867358);
  });

  it('现有快照能算出相对时间，且不改 #547 的截止和平衡口径', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    expect(freshnessText(relativeFreshness(arabia.fetchedAt, now))).toMatch(/^更新于 \d+ 天前$/);
    expect(freshnessText(relativeFreshness(team.fetchedAt, now))).toMatch(/^更新于 \d+ 天前$/);
    expect(snapshotCutoff(arabia)).toBe('2026-11-01');
    expect(snapshotCutoff(team)).toBe('2026-10-30');
    expect(isPatchMismatch(arabia.patchNote, 188329)).toBe(true);
    expect(isBalanceAligned(team.patchNote, 188329)).toBe(false);
  });

  it('缺样本量时渲染「样本未收录」，有数字时包进 .num', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    const missing = create(createElement(LadderFreshness, { fetchedAt: '2026-11-01', games: undefined, scope: '本分段样本', unit: '人次', now }));
    const days = freshnessText(relativeFreshness('2026-11-01', now)).match(/\d+/)?.[0];
    expect(days).toMatch(/^\d+$/);
    expect(missing.root.findByProps({ 'data-testid': 'ladder-sample' }).children).toEqual([SAMPLE_UNLISTED]);
    expect(missing.root.findByProps({ 'data-testid': 'ladder-relative' }).findByProps({ className: 'num' }).children).toEqual([days]);
    const known = create(createElement(LadderFreshness, { fetchedAt: '2026-11-15T09:00:00Z', games: 0, scope: '本切片样本', unit: '局', now }));
    const sample = known.root.findByProps({ 'data-testid': 'ladder-sample' });
    expect(sample.props.className).toBe('nw');
    expect(sample.findByProps({ className: 'num' }).children).toEqual(['0']);
    expect(known.root.findByProps({ 'data-testid': 'ladder-relative' }).findByProps({ className: 'num' }).children).toEqual(['3']);
    missing.unmount();
    known.unmount();
  });

  it('来源条挂上新鲜度，截止句和黄条原句还在', () => {
    const page = ['LadderArabia.tsx', 'LadderTeam.tsx', 'LadderFreshness.tsx'].map((name) => readFileSync(`src/features/ladder/${name}`, 'utf8')).join('\n');
    expect(page).toContain('data-testid="ladder-freshness"');
    expect(page).toContain('data-testid="ladder-relative"');
    expect(page).toContain('data-testid="ladder-sample"');
    expect(page).toContain('SAMPLE_UNLISTED');
    expect(page).toContain('data-testid="ladder-cutoff"');
    expect(page).toContain('胜率可能未反映最新平衡改动。');
    expect(page).not.toMatch(/setInterval|fetch\(/);
  });
});
