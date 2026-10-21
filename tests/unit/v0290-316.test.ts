/**
 * v0.29.0 验收（#329）B 组 #316 部分：取自 Kent Beck test/v0290-acceptance @ b34fc4c tests/unit/v0290-B.test.ts，断言原样未改。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import scoutingContent from '../../src/content/scouting.json';
import { analyseScouting, defaultScoutingConfig, SCOUTING_AREAS, withScenario, type ScoutingArea, type ScoutingConfig } from '../../src/domain/scouting';
import { ALL } from '../../src/shared/nav/sections';

// ---------- #316 ③ ----------
const OLD_DESC = '对照相容解释、反证和缺失信息，决定下一次补查什么';
const NEW_DESC = '对照具体信号，判断对手在做什么，安排下一步';
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

describe('#316 「侦察辨析」入口说明', () => {
  it('sections 里的说明换成新措辞', () => {
    expect(ALL.find((s) => s.path === '/scouting')!.desc).toBe(NEW_DESC);
  });
  it('src 下任何文件（含搜索索引、别名）都不再出现旧措辞', () => {
    const hits = files('src').filter((f) => readFileSync(f, 'utf8').includes(OLD_DESC));
    expect(hits).toEqual([]);
  });
});

// ---------- #316 新增城镇中心：两种解读同时列出（Steve 2026-10-21 21:11 / 21:18；issue 316 comment 6316912314） ----------
// 「看见新增城镇中心」始终同时列出两种解读，各带判断依据（位置）和一句应对；不随「可见范围」变化，不加新字段。
// 公开来源 AoE2 Coach 城镇中心页 https://aoecoach.com/en/resources/buildings/town-center/ ：
// - Castle Age Boom：“Upon reaching Castle Age, immediately build 2-3 additional Town Centers … rapidly grows your economy”
// - Forward Town Center：“building a Town Center on a contested gold or stone pile secures resources”；In pro play：“placing a TC near the opponent both pressures them”
// - How to counter it：“either boom harder yourself or punish them militarily”；“Forward TCs can be denied by contesting the location with early military or by Trebuchet/siege”
/** 判断依据 + 解读：同一句里（不跨句号 / 分号）位置线索与解读关键词相距不超过 24 字 */
const near = (cue: string, kw: string) => new RegExp(`(?:${cue})[^。；]{0,24}(?:${kw})|(?:${kw})[^。；]{0,24}(?:${cue})`);
const TC_BOOM_CUE = '敌方自家附近';
const TC_FWD_CUE = '前线|我方资源';
const TC_BOOM_READ = near(TC_BOOM_CUE, '扩张|经济');
const TC_FWD_READ = near(TC_FWD_CUE, '前置|进攻|压制');
/** 应对：扩张经济 → 同步扩张或用军队施压；前置 → 出兵争夺位置或用攻城武器拆除（须和「前置 / 前线 / 我方资源」写在同一句） */
const TC_BOOM_NEXT = /同步(扩张|发展)|更快地?(扩张|发展)|施压|惩罚|趁[^。；]{0,10}(出兵|进攻)/;
const TC_FWD_NEXT = near('前置|前线|我方资源', '争夺|驱逐|拆除|拆掉|投石|攻城|阻止|摧毁');
const walled = scoutingContent.scenarios.find((s) => s.id === 'walled')!;
const extraTc = walled.signals.find((s) => s.id === 'extra-tc')!;
const tcSeenAt = (area: ScoutingArea): ScoutingConfig => {
  const c = withScenario(defaultScoutingConfig(), 'walled');
  return { ...c, observations: { ...c.observations, 'new-town-center': { state: 'seen', at: '', area, stale: false } } };
};

describe('#316 「看见新增城镇中心」同时列出两种解读，各带判断依据和应对', () => {
  it('来源只有 AoE2 Coach 城镇中心页，不标「本站整理」', () => {
    expect(extraTc.sourceIds).toEqual(['aoecoach-town-center']);
    expect(extraTc.editorial).toBe(false);
    expect(scoutingContent.sources.find((s) => s.id === 'aoecoach-town-center')!.url).toBe('https://aoecoach.com/en/resources/buildings/town-center/');
  });
  it('「可能意味着什么」：敌方自家附近 = 扩张经济，前线 / 我方资源点附近 = 前置进攻', () => {
    expect(extraTc.meaning, '前置进攻（前线 / 我方资源点）').toMatch(TC_FWD_READ);
    expect(extraTc.meaning, '扩张经济（必须写「敌方自家附近」，Steve 21:22）').toMatch(TC_BOOM_READ);
  });
  it('「下一步做什么」：两种解读各有一句应对', () => {
    expect(extraTc.next, '前置：出兵争夺位置或用攻城武器拆除').toMatch(TC_FWD_NEXT);
    expect(extraTc.next, '扩张经济：同步扩张或用军队施压').toMatch(TC_BOOM_NEXT);
  });
  it('守卫：解读不随「可见范围」变化（四种范围下辨析结果完全相同）', () => {
    const outs = SCOUTING_AREAS.map((area) => JSON.stringify(analyseScouting(tcSeenAt(area))));
    expect(analyseScouting(tcSeenAt('own-approach')).status).toBe('covered');
    expect(new Set(outs).size).toBe(1);
  });
});
