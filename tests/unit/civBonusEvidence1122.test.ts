import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { civs, loadCore } from '../../src/data';
import { CivBonusText } from '../../src/features/civs/components/civBonusText';
import { createEvidenceLoader } from '../../src/features/civs/components/evidenceLoader';
import { civBonuses } from '../../src/domain/civBonus';
import { BonusBodyContent } from '../../src/shared/ui/BonusBody';
import { committedDestination, isUnmodifiedPrimaryClick, matchesBonusReturn, type BonusSnapshot } from '../../src/features/civs/components/useCivBonusReturn';

describe('civ bonus evidence formatting and loading', () => {
  it('keeps signed, slash-age and complete unit phrases in one nowrap span', () => {
    const source = '+25% / −10/15%：+1/+2射程，1.2/1.11/1.05；2 个村民、9 格范围内、2片果树丛、+15生命值、+2秒、+50黄金';
    const markup = renderToStaticMarkup(createElement(CivBonusText, { text: source }));
    expect(markup.replace(/<[^>]*>/g, '')).toBe(source);
    expect(markup).toContain('class="num nw">2 个村民</span>');
    expect(markup).toContain('class="num nw">1.2/1.11/1.05</span>');
    expect(markup).toContain('class="num nw">9 格范围内</span>');
    expect(markup).toContain('class="num nw">2片果树丛</span>');
    expect(markup).toContain('class="num nw">+1/+2射程</span>');
    expect(markup).toContain('class="num nw">+15生命值</span>');
    expect(markup).toContain('class="num nw">+2秒</span>');
    expect(markup).toContain('class="num nw">+50黄金</span>');
  });

  it('retries a rejected cold core load and caches only a successful bundle', async () => {
    const loadCore = vi.fn().mockRejectedValueOnce(new Error('fixture: simulated cold core chunk failure')).mockResolvedValue('core');
    const loadRenderer = vi.fn().mockResolvedValue('renderer');
    const load = createEvidenceLoader(loadCore, loadRenderer);
    await expect(load()).rejects.toThrow('fixture: simulated cold core chunk failure');
    await expect(load()).resolves.toEqual({ core: 'core', renderer: 'renderer' });
    await expect(load()).resolves.toEqual({ core: 'core', renderer: 'renderer' });
    expect(loadCore).toHaveBeenCalledTimes(2);
    expect(loadRenderer).toHaveBeenCalledTimes(2);
  });

  it('retries a rejected renderer import without caching partial core data', async () => {
    const loadCore = vi.fn().mockResolvedValue('core');
    const loadRenderer = vi.fn().mockRejectedValueOnce(new Error('fixture: simulated evidence chunk failure')).mockResolvedValue('renderer');
    const load = createEvidenceLoader(loadCore, loadRenderer);
    await expect(load()).rejects.toThrow('fixture: simulated evidence chunk failure');
    await expect(load()).resolves.toEqual({ core: 'core', renderer: 'renderer' });
    expect(loadCore).toHaveBeenCalledTimes(2);
    expect(loadRenderer).toHaveBeenCalledTimes(2);
  });

  it('renders each raw rule and every repeated target occurrence from a synthetic fixture', async () => {
    const core = await loadCore();
    const gurjaras = civs.find((civ) => civ.en === 'Gurjaras')!;
    const bonus = civBonuses(gurjaras).find((item) => item.id === 'Gurjaras-2')!;
    const entry = bonus.dat.find((item) => item.rules.length > 0)!;
    const sourceRule = entry.rules[0]!;
    const target = sourceRule.t[0]!;
    const repeatedRule = { ...sourceRule, b: 1 as const, t: [target, target] };
    const sample = { ...bonus, dat: [{ ...entry, rules: [repeatedRule, { ...repeatedRule }] }] };
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(BonusBodyContent, { b: sample, core, variant: 'evidence' })));

    expect(markup).toContain('data-raw-rule-index="0" data-raw-target-count="2"');
    expect(markup).toContain('data-raw-rule-index="1" data-raw-target-count="2"');
    expect(markup.match(new RegExp(`data-raw-target-id="${target}"`, 'gu'))).toHaveLength(4);
    expect(markup).toContain('s=bonus');
    expect(markup).toContain('op=mul');
    expect(markup).toContain('v=1.2');
    expect(markup).toContain('vs=僧侣');
    expect(markup).toContain('b=1');
  });

  it('renders the complete empty raw-record message for a fixed team bonus', async () => {
    const core = await loadCore();
    const berbers = civs.find((civ) => civ.en === 'Berbers')!;
    const bonus = civBonuses(berbers).find((item) => item.id === 'Berbers-team')!;
    expect(bonus.dat).toHaveLength(0);
    expect(bonus.eco).toHaveLength(0);
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(BonusBodyContent, { b: bonus, core, variant: 'evidence' })));

    expect(markup).toContain('暂无本条对应的原始数据记录；英文说明仍可阅读。');
  });

  it('preserves the fixed Britons sample in the existing default-detail renderer', async () => {
    const core = await loadCore();
    const britons = civs.find((civ) => civ.en === 'Britons')!;
    const bonus = civBonuses(britons).find((item) => item.id === 'Britons-2')!;
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(BonusBodyContent, { b: bonus, core })));
    const text = markup.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');
    const compactText = text.replace(/\s+/gu, '');

    expect(compactText).toContain('步弓手在城堡/帝王时代的射程+1/+2');
    expect(text).toContain('Foot Archers +1/+2 range in Castle/Imperial Age');
    expect(text).toContain('（帝王时代数值）');
    expect(text).toContain('游戏数据原始效果');
  });
});

describe('civ bonus return commits and POP matching', () => {
  const snapshot: BonusSnapshot = {
    sourceKey: 'source',
    sourcePath: '/civ/Gurjaras',
    sourceSearch: '',
    sourceHash: '#bonuses',
    sourceIdx: 7,
    civ: 'Gurjaras',
    bonusId: 'Gurjaras-2',
    scrollY: 520,
    expectedUrl: 'http://localhost/#/civ/Gurjaras/bonus/2',
    destinationKey: 'destination',
    destinationIdx: 8,
  };

  it('arms only for the expected URL, fresh key and idx+1 commit', () => {
    expect(committedDestination(snapshot.expectedUrl, 'source', 7, snapshot.expectedUrl, { key: 'destination', idx: 8 })).toEqual({
      key: 'destination',
      idx: 8,
    });
    expect(committedDestination(snapshot.expectedUrl, 'source', 7, 'http://localhost/#/civ/Gurjaras', { key: 'destination', idx: 8 })).toBeUndefined();
    expect(committedDestination(snapshot.expectedUrl, 'source', 7, snapshot.expectedUrl, { key: 'destination', idx: 9 })).toBeUndefined();
    expect(committedDestination(snapshot.expectedUrl, 'source', 7, snapshot.expectedUrl, { key: 'source', idx: 8 })).toBeUndefined();
  });

  it('does not capture modified clicks or non-primary buttons', () => {
    expect(isUnmodifiedPrimaryClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })).toBe(true);
    for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const)
      expect(
        isUnmodifiedPrimaryClick({ button: 0, metaKey: key === 'metaKey', ctrlKey: key === 'ctrlKey', shiftKey: key === 'shiftKey', altKey: key === 'altKey' }),
      ).toBe(false);
    expect(isUnmodifiedPrimaryClick({ button: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })).toBe(false);
  });

  it('consumes only the exact source POP preceded by the committed destination', () => {
    const source = { civ: 'Gurjaras', key: 'source', pathname: '/civ/Gurjaras', search: '', hash: '#bonuses' };
    expect(matchesBonusReturn(snapshot, source, { key: 'destination', idx: 8 }, { key: 'source', idx: 7 })).toBe(true);
    expect(matchesBonusReturn(snapshot, { ...source, civ: 'Romans' }, { key: 'destination', idx: 8 }, { key: 'source', idx: 7 })).toBe(false);
    expect(matchesBonusReturn(snapshot, source, { key: 'other', idx: 8 }, { key: 'source', idx: 7 })).toBe(false);
    expect(matchesBonusReturn(snapshot, source, { key: 'destination', idx: 8 }, { key: 'source', idx: 6 })).toBe(false);
  });
});
