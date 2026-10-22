// issue 273：Steve 2026-10-22 第二轮设计审（PR 360 @ cc63472）4 组文案：队伍加成卡片的研究条件与目标覆盖、页底两条范围说明、多人施工两条提示。只改文字，数值不变。
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import TEAM from '../../src/data/team_bonuses.json';
import { calculateConstruction, DEFAULT_CONSTRUCTION, type ConstructionConfig } from '../../src/domain/construction';
import { playerTeamNote, teamPrereqLabel } from '../../src/features/teamBonuses/TeamBonuses';

let core: Core;
let ctx: { core: Core; trees: Awaited<ReturnType<typeof loadTrees>> };
beforeAll(async () => {
  core = await loadCore();
  ctx = { core, trees: await loadTrees() };
});
const TEAM_SRC = readFileSync(new URL('../../src/features/teamBonuses/TeamBonuses.tsx', import.meta.url), 'utf8');
/** 编号、原始字段一类的内部说法 */
const INTERNAL = /#\d|\d{3,}|原始|原字段|静态关联|全目录|旧开局模型|旧详情|基数|客户端/;

describe('#273 第 1 组：团队科技卡片的研究条件', () => {
  it('折叠标题和说明换成玩家用语', () => {
    expect(TEAM_SRC).toContain('<summary>研究条件</summary>');
    expect(TEAM_SRC).toContain('需满足下列条件中的 {source.requiredCount} 项；其中可能有时代要求，以及科技树里看不到的游戏内部条件。');
    expect(TEAM_SRC).not.toMatch(/原始前置门槛|需满足原始前置|条件科技 #|固定数据中的隐藏或时代条件/);
  });
  it('查不到名字的条件写「游戏内部条件（科技树里看不到）」，不出现编号', () => {
    for (const id of [601, 639, 307, 999999]) {
      expect(core.techById[id]).toBeUndefined();
      expect(teamPrereqLabel(id, core)).toBe('游戏内部条件（科技树里看不到）');
    }
  });
  it('查得到名字的条件写名字（数据里现有的都是时代）', () => {
    const ids = [...new Set(TEAM.technologies.flatMap((s) => s.prerequisites))];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const label = teamPrereqLabel(id, core);
      expect(label).toBe(core.techById[id]!.zh);
      expect(label).not.toMatch(/\d/);
    }
  });
});

describe('#273 第 2 组：目标覆盖', () => {
  it('三种写法和后半句', () => {
    expect(TEAM_SRC).toContain("'已全部核对'");
    expect(TEAM_SRC).toContain("'部分已核对，其余待核实'");
    expect(TEAM_SRC).toContain("'待核实'");
    expect(TEAM_SRC).toContain('。这些目标不会合并成一个数值。');
    expect(TEAM_SRC).not.toMatch(/已解析当前原始命令|部分已解析|不将这些关联合成为数值结果/);
  });
});

describe('#273 第 3 组：页底「数据版本与覆盖边界」', () => {
  it.each([
    [
      '属性单位/类别目标与生产目录为静态关联；不合成队伍倍率，不作客户端实测声明。',
      '受影响的单位、类别和可训练单位只列出对应关系；不计算队伍总倍率，没有在游戏里实测。',
    ],
    ['生产单位是全目录间接关联，不限定为加成来源文明。', '通过生产建筑关联到的单位按所有文明列出，不限于提供加成的文明。'],
  ])('%s', (from, to) => {
    expect(TEAM.meta.scopeNotes).toContain(from);
    expect(playerTeamNote(from, core)).toBe(to);
  });
  it('页底每条范围说明转换后都没有内部说法', () => {
    for (const note of TEAM.meta.scopeNotes) expect(playerTeamNote(note, core)).not.toMatch(INTERNAL);
  });
});

describe('#273 第 4 组：多人施工按条件出现的提示', () => {
  const calc = (extra: Partial<ConstructionConfig>) => calculateConstruction(ctx, { ...DEFAULT_CONSTRUCTION, techs: [], ...extra });
  it.each(['Spanish', 'Romans'])('%s：建造速度加成提示', (civ) => {
    const r = calc({ civ });
    expect(r.warnings).toContain('本工具计入了这个文明的建造速度加成，结果可能和开局模拟不同。');
    expect(r.warnings.join()).not.toMatch(/旧开局模型|原字段/);
  });
  it('城镇中心：150 秒提示', () => {
    const r = calc({ buildingId: 109 });
    expect(r.warnings).toContain('按游戏里实际建造城镇中心的 150 秒计算，和其他页面里的 100 秒不是同一个口径。');
    expect(r.warnings.join()).not.toMatch(/施工附属物|基数|旧详情|开局模型/);
  });
  it('其他文明、其他建筑不出现这两条', () => {
    expect(calc({ civ: 'Franks', buildingId: 70 }).warnings.join()).not.toMatch(/建造速度加成|150 秒/);
  });
});
