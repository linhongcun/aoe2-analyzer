import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatWinDelta,
  isBalanceAligned,
  isPatchMismatch,
  isPlayerSample,
  metaQuadrant,
  snapshotCutoff,
  snapshotPatchBuild,
  visibleSourceLabel,
  winBand,
  type LadderSnapshot,
} from '../../src/domain/ladder';
import { canonicalLadderSearch, resolveLadderLocation } from '../../src/domain/ladderQuery';

const arabia = JSON.parse(readFileSync('src/data/ladder-arabia-p162286.json', 'utf8')) as LadderSnapshot;
const team = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as LadderSnapshot;

describe('天梯默认切片地址与平衡口径 #577', () => {
  it('补丁号缺失时不算当前平衡，即使 isPatchMismatch 为 false', () => {
    expect(snapshotPatchBuild(team.patchNote)).toBeNull();
    expect(isPatchMismatch(team.patchNote, 188329)).toBe(false);
    expect(isBalanceAligned(team.patchNote, 188329)).toBe(false);
    expect(isBalanceAligned('DE 188329', 188329)).toBe(true);
    expect(isBalanceAligned('patch 162286', 188329)).toBe(false);
  });

  it('玩家看到的截止日是窗口终点，不是取回日', () => {
    expect(snapshotCutoff(team)).toBe('2026-10-30');
    expect(team.fetchedAt).toBe('2026-11-01');
    expect(snapshotCutoff(arabia)).toBe(arabia.fetchedAt);
  });

  it('4v4 样本是人次，来源名不印到界面', () => {
    expect(isPlayerSample(team.sample?.unit)).toBe(true);
    expect(visibleSourceLabel(team.source)).toBe('来源');
    expect(visibleSourceLabel(team.source).toLowerCase()).not.toContain('aoe2scout');
    expect(visibleSourceLabel(arabia.source)).toBe('aoestats.io');
  });

  it('分层档界和分布象限按锁定边界', () => {
    expect(winBand(52)).toBe('S');
    expect(winBand(51.999)).toBe('A');
    expect(winBand(51)).toBe('A');
    expect(winBand(50.999)).toBe('B');
    expect(winBand(50)).toBe('B');
    expect(winBand(48)).toBe('C');
    expect(winBand(47.999)).toBe('D');
    expect([metaQuadrant(50, 2, 2), metaQuadrant(50, 1.99, 2), metaQuadrant(49.99, 2, 2), metaQuadrant(49.99, 1.99, 2)]).toEqual([
      '强且常见',
      '强且少见',
      '弱且常见',
      '弱且少见',
    ]);
  });

  it('相对 50% 用百分点，零不带正负号', () => {
    expect(formatWinDelta(51.4)).toEqual({ text: '+1.40', tone: 'good' });
    expect(formatWinDelta(49.5)).toEqual({ text: '−0.50', tone: 'bad' });
    expect(formatWinDelta(50)).toEqual({ text: '0.00', tone: 'muted' });
  });

  it('无参数是 4v4 表；只带 elo 进入阿拉伯；分层参数先留着', () => {
    expect(resolveLadderLocation('', arabia)).toMatchObject({ mode: '4v4', elo: 'all', pendingView: null, toast: null });
    expect(canonicalLadderSearch(resolveLadderLocation('', arabia))).toBe('');
    expect(resolveLadderLocation('?elo=all', arabia)).toMatchObject({ mode: 'arabia1v1', elo: 'all', toast: null });
    expect(canonicalLadderSearch(resolveLadderLocation('?elo=all', arabia))).toBe('?mode=arabia1v1');
    expect(resolveLadderLocation('?elo=lt850', arabia).mode).toBe('arabia1v1');
    expect(resolveLadderLocation('?elo=lt850', arabia).toast).toContain('暂无数据');
    expect(resolveLadderLocation('?mode=arabia1v1', arabia).mode).toBe('arabia1v1');
    expect(resolveLadderLocation('?view=tiers', arabia)).toMatchObject({ mode: '4v4', pendingView: 'tiers', toast: null });
    expect(canonicalLadderSearch(resolveLadderLocation('?view=tiers', arabia))).toBe('?view=tiers');
    expect(resolveLadderLocation('?view=meta', arabia).pendingView).toBe('meta');
    expect(resolveLadderLocation('?view=nope', arabia).toast).toContain('未识别的视图');
    expect(resolveLadderLocation('?mode=2v2', arabia).toast).toContain('未识别的模式');
    expect(canonicalLadderSearch(resolveLadderLocation('?mode=2v2', arabia))).toBe('');
  });
});
