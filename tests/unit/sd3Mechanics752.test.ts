import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// @ts-expect-error scripts/*.mjs has no declaration
import { planChanges } from '../../scripts/ci-scope.mjs';
import { SD3_HANDBOOK_SOURCE, VICTORY_MODE_COPY } from '../../src/features/gameGuide/victoryModes';
import SuddenDessasterMechanics from '../../src/features/maps/SuddenDessasterMechanics';
import { SD3_CHECKED_AT, SD3_MAPS } from '../../src/features/maps/suddenDessaster3Data';
import { SD3_WATCH_CHECKED_AT, SD3_WATCH_ROWS } from '../../src/features/maps/sd3Watch';
import { SD3_MECHANICS, SD3_MECHANICS_CHECKED_AT, SD3_MECHANICS_LINK, SD3_SOURCE, mechanicPieces } from '../../src/features/maps/sd3Mechanics';

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const banned = /推荐文明|打法|必胜|胜率|开一局|速攻|速封|天梯|直播|比分|大型战舰|冰上单位/;

describe('#752 手册机制短卡', () => {
  it('只保留 2026-11-07 读到的三张图，数字按手册原文切分', () => {
    expect(SD3_SOURCE).toBe('https://www.twestaoe.net/events/suddendessaster3');
    expect(SD3_MECHANICS_CHECKED_AT).toBe('2026-11-07');
    expect(SD3_MECHANICS.map((map) => map.en)).toEqual(['Thin Ice', 'Monkey Island', 'Holy Hollow']);
    expect(SD3_MECHANICS.map((map) => map.name)).toEqual(['薄冰', '猴岛', '圣谷']);
    expect(mechanicPieces('使用生命值 1,800 的石墙。')).toEqual([
      { kind: 'text', value: '使用生命值 ' },
      { kind: 'num', value: '1,800' },
      { kind: 'text', value: ' 的石墙。' },
    ]);
    expect(mechanicPieces('训练时间为 65 秒。')).toEqual([
      { kind: 'text', value: '训练时间为 ' },
      { kind: 'num', value: '65 秒' },
      { kind: 'text', value: '。' },
    ]);
    const facts = SD3_MECHANICS.flatMap((map) => map.facts).join('\n');
    expect(facts).toContain('冰上的一切');
    expect(facts).toContain('large warships');
    expect(facts).toContain('1,800');
    expect(facts).toContain('65 秒');
    expect(facts).toContain('Army Tents');
    expect(facts).toContain('Gunpowder Kegs');
    expect(facts).not.toMatch(banned);
    for (const map of SD3_MECHANICS) {
      expect(map.pending.length).toBeGreaterThan(0);
      for (const item of map.pending) expect(item.startsWith('待确认：')).toBe(true);
    }
  });

  it('短卡链到手册，不出现打法句，也不使用表格', () => {
    const html = renderToStaticMarkup(createElement(SuddenDessasterMechanics));
    const visible = text(html);
    expect(html).toContain('data-testid="sd3-mechanics"');
    expect(html).toContain('<details');
    expect(html).toMatch(/<details[^>]*\sopen(?:=""|\s|>)/);
    expect(html).not.toContain('<table');
    expect(visible).toContain('猝死赛图特殊机制');
    expect(visible).toContain('3 张');
    expect(visible).toContain(SD3_MECHANICS_LINK);
    expect(visible).toContain('2026-11-07');
    expect(visible).toContain('TheMadCADer');
    expect(visible).toContain('Jasouki');
    expect(visible).toContain('DeathCounter');
    expect(visible).not.toMatch(banned);
    expect(html).toContain(`href="${SD3_SOURCE}"`);
    expect(html).toContain('class="num nw"');
    expect(html.match(/data-sd3-mechanic="/g)).toHaveLength(3);
    expect(html.match(/data-kind="pending"/g)?.length).toBe(SD3_MECHANICS.reduce((sum, map) => sum + map.pending.length, 0));
  });

  it('不改合集要点、观赛窗口和胜利条件口径', () => {
    expect(SD3_CHECKED_AT).toBe('2026-11-04');
    expect(SD3_MAPS.find((map) => map.id === 'sd3-thin-ice')?.tip).toBe('码头被毁会使整片冰面及其上的东西坠水，护城也要护码头。');
    expect(SD3_MAPS.find((map) => map.id === 'sd3-monkey-island')?.tip).toBe('占领帐篷可训练爆破兵，主城要防多方向偷袭。');
    expect(SD3_MAPS.find((map) => map.id === 'sd3-holy-hollow')?.tip).toBe('火药桶会连锁炸开林地，护主城时要盯住新通道。');
    expect(SD3_WATCH_CHECKED_AT).toBe('2026-11-06');
    expect(SD3_WATCH_ROWS.map((row) => row.label)).toEqual(['半决赛', '决赛']);
    expect(VICTORY_MODE_COPY.sd3).toBe('主办方公开手册写：不能再建城镇中心；最后一座城镇中心被毁就会立刻输掉。这只说明该赛事图包。');
    expect(SD3_HANDBOOK_SOURCE.checkedAt).toBe('2026-11-06');
    expect(readFileSync('src/features/maps/Maps.tsx', 'utf8')).toContain('<SuddenDessaster3 />\n        <SuddenDessasterMechanics />');
    expect(readFileSync('src/features/gameGuide/GameGuide.tsx', 'utf8')).not.toContain('SuddenDessasterMechanics');
    expect(readFileSync('src/features/maps/SuddenDessasterWatch.tsx', 'utf8')).not.toContain('火药桶');
  });
});

describe('#752 地图范围登记', () => {
  it('只改机制短卡时仍跑本卡和既有地图用例', () => {
    const plan = planChanges([{ path: 'src/features/maps/SuddenDessasterMechanics.tsx', before: '', after: 'export {}' }]);
    expect(plan).toMatchObject({ scope: 'targeted', features: ['maps'], full: false, data: false });
    expect(plan.unit).toContain('tests/unit/sd3Mechanics752.test.ts');
    expect(plan.unit).toContain('tests/unit/sd3Watch702.test.ts');
    expect(plan.e2e).toContain('tests/e2e/sd3Mechanics752.spec.ts');
    expect(plan.e2e).toContain('tests/e2e/mapCatalog422.spec.ts');
    expect(plan.e2e).toContain('tests/e2e/sd3Watch702.spec.ts');
  });
});
