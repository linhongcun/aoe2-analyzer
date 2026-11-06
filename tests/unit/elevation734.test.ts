import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  CLIFF_PENDING,
  elevationFacts,
  formatElevationNumber,
  HIGHER_BASE,
  HOTFIX_82587,
  LOWER_BASE,
  resourceAdd,
  TERRAIN_OMISSION,
  UGC_ELEVATION_SOURCE,
} from '../../src/features/gameGuide/elevation';
import ElevationCard from '../../src/features/gameGuide/elevationCard';

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('#734 高地乘子只读经济数据，基数用已锁公式', () => {
  it('两位小数保留到分，合不拢的数不假装精确', () => {
    expect(formatElevationNumber(1.25)).toBe('1.25');
    expect(formatElevationNumber(0.75)).toBe('0.75');
    expect(formatElevationNumber(1.5)).toBe('1.50');
    expect(formatElevationNumber(0.25)).toBe('0.25');
    expect(formatElevationNumber(0)).toBe('0');
    expect(formatElevationNumber(Number.NaN)).toBeNull();
  });

  it('鞑靼资源 211 为 0.25、212 为 0，其它文明没有改写', () => {
    const facts = elevationFacts();
    expect(facts.patchBuild).toBe('188329');
    expect(facts.patchDate).toBe('2026-10-28');
    expect(facts.defaultHigher).toBe(formatElevationNumber(HIGHER_BASE));
    expect(facts.defaultLower).toBe(formatElevationNumber(LOWER_BASE));
    expect(facts.tatars.higherAdd).toEqual({ state: 'value', value: 0.25 });
    expect(facts.tatars.lowerAdd).toEqual({ state: 'value', value: 0 });
    expect(facts.tatars.higher).toBe('1.50');
    expect(facts.tatars.lower).toBe('0.75');
    expect(facts.tatars.techs).toEqual([696]);
    expect(facts.tatars.zh).toBe('鞑靼');
    expect(facts.tatars.bonusIndex).toBe(1);
    expect(facts.tatars.bonusZh).toBe('在高海拔战斗时，单位造成的伤害 +25%');
    expect(facts.tatars.catalogMatches).toBe(true);
    expect(facts.others).toEqual([]);
  });

  it('缺行或不是加法时标待确认，不回退成默认乘子', () => {
    expect(resourceAdd(undefined, 211)).toEqual({ state: 'absent' });
    expect(resourceAdd([{ effects: [{ kind: 'res', op: 'mul', res: 211, v: 2 }] }], 211)).toEqual({ state: 'pending' });
    const facts = elevationFacts({
      meta: { patch: 'DE Update 1 (2000-01-01)' },
      civEco: { Tatars: [{ effects: [{ kind: 'res', op: 'set', res: 211, v: 1 }] }] },
    });
    expect(facts.patchBuild).toBe('1');
    expect(facts.tatars.higher).toBeNull();
    expect(facts.tatars.higherAdd).toEqual({ state: 'pending' });
    expect(facts.tatars.lowerAdd).toEqual({ state: 'absent' });
    expect(facts.tatars.catalogMatches).toBe(false);
    expect(facts.defaultHigher).toBe('1.25');
  });

  it('只有真正改写海拔资源的其它文明才列出来', () => {
    const facts = elevationFacts(
      {
        civEco: {
          Tatars: [
            {
              tech: 696,
              effects: [
                { kind: 'res', op: 'add', res: 211, v: 0.25 },
                { kind: 'res', op: 'add', res: 212, v: 0 },
              ],
            },
          ],
          Franks: [{ tech: 1, effects: [{ kind: 'res', op: 'add', res: 211, v: 0.1 }] }],
          Britons: [{ effects: [{ kind: 'res', op: 'add', res: 36, v: 1 }] }],
        },
      },
      [],
    );
    expect(facts.others.map((civ) => civ.en)).toEqual(['Franks']);
    expect(facts.others[0]?.higher).toBe(formatElevationNumber(HIGHER_BASE + 0.1));
  });
});

describe('#734 短卡写明出处、未计入地形，悬崖不写死', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ElevationCard)));
  const visible = text(html);

  it('默认、鞑靼和两条站内入口都在', () => {
    expect(visible).toContain('×1.25');
    expect(visible).toContain('×0.75');
    expect(visible).toContain('×1.50');
    expect(visible).toContain(TERRAIN_OMISSION);
    expect(visible).toContain('在高海拔战斗时，单位造成的伤害 +25%');
    expect(html).toContain('href="/civ/Tatars"');
    expect(html).toContain('href="/civ/Tatars/bonus/1"');
    expect(html).toContain('href="/duel"');
    expect(html).toContain('href="/matchup"');
    expect(visible).not.toContain('修道院');
    expect(visible).not.toContain('1.5625');
  });

  it('悬崖段落没有数字，三处出处可见', () => {
    expect(CLIFF_PENDING).not.toMatch(/\d/);
    const cliff = html.split('data-elevation="cliff"')[1]?.split('</p>')[0] ?? '';
    expect(cliff).toContain(CLIFF_PENDING);
    expect(cliff).not.toMatch(/\d/);
    expect(html).toContain(`href="${UGC_ELEVATION_SOURCE.url}"`);
    expect(html).toContain('dateTime="2026-11-05"');
    expect(visible).toContain('188329');
    expect(visible).toContain('2026-10-28');
    expect(html).toContain(`href="${HOTFIX_82587.url}"`);
    expect(visible).toContain(HOTFIX_82587.quote);
    expect(visible).toContain(HOTFIX_82587.publishedAt);
  });

  it('鞑靼增量无法相加时不显示推算乘子', () => {
    const facts = elevationFacts({ civEco: { Tatars: [{ effects: [{ kind: 'res', op: 'set', res: 211, v: 1 }] }] } });
    const pending = text(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ElevationCard, { facts }))));
    expect(pending).toContain('待确认');
    expect(pending).not.toContain('×1.50');
    expect(pending).toContain(CLIFF_PENDING);
  });
});
