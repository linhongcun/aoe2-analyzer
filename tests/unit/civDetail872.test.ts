import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import techCatalog from '../../data/game/techs.json';
import { civByEn, civs, loadCore, type Core } from '../../src/data';
import { civUniqueTechs, civUniqueUnitItems, civUniqueUnits, kitUpgradeLabel, relatedRegionalLines, relatedRegionalUnitItems } from '../../src/domain/civKit';
import { regionalUnitLines } from '../../src/domain/civUnits';
import { strengths } from '../../src/domain/ratings';

let core: Core;

beforeAll(async () => {
  core = await loadCore();
});

function bases(en: string) {
  const civ = civByEn(en);
  if (!civ) throw new Error(en);
  return relatedRegionalLines(civ, core.units, core.techs).map((line) => line[0]!.zh);
}

describe('文明详情套件装配', () => {
  it('蒙古只把写进加成的草原枪兵放进套件，骆驼兵仍可造但不进套件', () => {
    expect(bases('Mongols')).toEqual(['草原枪兵']);
    expect(regionalUnitLines('Mongols', core.units).some((line) => line[0]?.zh === '骆驼兵')).toBe(true);
    const units = civUniqueUnits('Mongols', core.units, core.fam);
    expect(units.map((line) => line.u.zh)).toEqual(['蒙古突骑']);
    expect(units[0]?.elite?.id).toBe(561);
    const techs = civUniqueTechs('Mongols', core.techs);
    expect(techs.map((tech) => tech.id)).toEqual([487, 6]);
  });

  it('拜占庭带上加成或独特科技点名的瓦兰吉卫队、德罗蒙和骆驼兵', () => {
    expect(bases('Byzantines').sort()).toEqual(['德罗蒙战舰', '瓦兰吉卫队', '骆驼兵'].sort());
    const techs = civUniqueTechs('Byzantines', core.techs);
    expect(techs.map((tech) => tech.zh)).toEqual(['希腊之火', '后勤学']);
  });

  it.each(civs.map(({ en }) => en))('%s 的套件逐时代列全且只列本文明的目录独特科技', (civ) => {
    const expected = techCatalog.flatMap((tech) => {
      if (tech.type !== 'UniqueTech' || !tech.civs.includes(civ)) return [];
      const { id, age, zh } = tech;
      return [{ id, age, zh }];
    });
    expected.sort((a, b) => a.age - b.age || a.id - b.id);
    expect(civUniqueTechs(civ, core.techs).map(({ id, age, zh }) => ({ id, age, zh }))).toEqual(expected);
  });

  it('宽类别效果不把整类骑兵都塞进套件', () => {
    expect(bases('Cumans')).toEqual(['草原枪兵']);
    expect(bases('Cumans')).not.toContain('骆驼兵');
    expect(bases('Gurjaras')).toEqual(expect.arrayContaining(['骆驼兵', '骑象射手']));
    expect(bases('Gurjaras')).not.toContain('装甲战象');
    expect(bases('Vietnamese')).toEqual(['象兵']);
    expect(bases('Vietnamese')).not.toContain('火矛兵');
  });

  it('哥特能造德罗蒙，但加成和独特科技都没点名，套件省略', () => {
    expect(regionalUnitLines('Goths', core.units).some((line) => line[0]?.zh === '德罗蒙战舰')).toBe(true);
    expect(bases('Goths')).not.toContain('德罗蒙战舰');
  });

  it('每个文明的套件只含本文明能造的区域单位', () => {
    for (const civ of civs) {
      for (const line of relatedRegionalLines(civ, core.units, core.techs)) {
        expect(line.length).toBeGreaterThan(0);
        for (const unit of line) {
          expect(unit.type).toBe('RegionalUnit');
          expect(unit.civs).toContain(civ.en);
        }
      }
    }
  });

  it('全站 56 文明套件升级副标题按家族数据规则区分直接精锐与非精锐/多阶终阶（#1490）', () => {
    const nonDirectElite: { civ: string; base: string; tail: string; label: string }[] = [];
    const directElite: { civ: string; base: string }[] = [];
    const singleForm: { civ: string; base: string }[] = [];

    for (const civ of civs) {
      const lines = relatedRegionalLines(civ, core.units, core.techs);
      const items = relatedRegionalUnitItems(civ, core.units, core.techs, core.fam);
      expect(items).toHaveLength(lines.length);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const item = items[i]!;
        const base = line[0]!;
        const tail = line.length > 1 ? line[line.length - 1] : undefined;
        expect(item.u.id).toBe(base.id);

        if (!tail || tail.id === base.id) {
          expect(item.upgrade).toBeUndefined();
          expect(item.upgradeLabel).toBeUndefined();
          singleForm.push({ civ: civ.en, base: base.zh });
          continue;
        }

        expect(item.upgrade?.id).toBe(tail.id);
        const isDirectElite = core.fam.eliteOf[base.id]?.id === tail.id;
        expect(item.upgradeLabel).toBe(isDirectElite ? '含精锐' : `含${tail.zh}`);
        if (isDirectElite) directElite.push({ civ: civ.en, base: base.zh });
        else nonDirectElite.push({ civ: civ.en, base: base.zh, tail: tail.zh, label: item.upgradeLabel! });
      }

      const uniquePairs = civUniqueUnits(civ.en, core.units, core.fam);
      const uniqueItems = civUniqueUnitItems(civ.en, core.units, core.fam);
      expect(uniqueItems).toHaveLength(uniquePairs.length);
      for (let i = 0; i < uniquePairs.length; i++) {
        const pair = uniquePairs[i]!;
        const item = uniqueItems[i]!;
        expect(item.u.id).toBe(pair.u.id);
        if (pair.elite) {
          expect(core.fam.eliteOf[pair.u.id]?.id).toBe(pair.elite.id);
          expect(item.upgrade?.id).toBe(pair.elite.id);
          expect(item.upgradeLabel).toBe('含精锐');
        } else {
          expect(item.upgrade).toBeUndefined();
          expect(item.upgradeLabel).toBeUndefined();
        }
      }
    }

    expect(directElite).toHaveLength(20);
    expect(nonDirectElite).toHaveLength(18);
    expect(singleForm.length).toBeGreaterThan(0);

    const byKey = new Map(nonDirectElite.map((row) => [`${row.civ}:${row.base}`, row.label]));
    for (const civ of ['Berbers', 'Byzantines', 'Ethiopians', 'Gurjaras', 'Hindustanis', 'Malians', 'Saracens']) {
      expect(byKey.get(`${civ}:骆驼兵`)).toBe('含重装骆驼兵');
    }
    for (const civ of ['Chinese', 'Jurchens', 'Koreans']) {
      expect(byKey.get(`${civ}:火箭推车`)).toBe('含重型火箭推车');
    }
    for (const civ of ['Wei', 'Wu']) {
      expect(byKey.get(`${civ}:黑光铠骑兵`)).toBe('含重装黑光铠骑兵');
    }
    expect(byKey.get('Bengalis:装甲战象')).toBe('含攻城战象');
    expect(byKey.get('Franks:骑马弩兵')).toBe('含重装骑马弩兵');
    expect(byKey.get('Mayans:鹰斥候')).toBe('含精锐鹰勇士');
    for (const civ of ['Incas', 'Muisca', 'Tupi']) {
      expect(byKey.get(`${civ}:蔷琵斥候`)).toBe('含精锐蔷琵战士');
    }

    // 印度斯坦帝王骆驼兵保留在独特单位区，不混入区域单位
    const hindustanisUnique = civUniqueUnitItems('Hindustanis', core.units, core.fam);
    expect(hindustanisUnique.map((item) => [item.u.zh, item.upgradeLabel])).toEqual([
      ['古拉姆', '含精锐'],
      ['帝王骆驼兵', undefined],
    ]);
    const hindustanisRegional = relatedRegionalUnitItems(civByEn('Hindustanis')!, core.units, core.techs, core.fam);
    expect(hindustanisRegional.map((item) => [item.u.zh, item.upgradeLabel])).toEqual([['骆驼兵', '含重装骆驼兵']]);

    // 正向直接精锐与单形态对照
    const bengalisRegional = relatedRegionalUnitItems(civByEn('Bengalis')!, core.units, core.techs, core.fam);
    expect(bengalisRegional.map((item) => [item.u.zh, item.upgradeLabel])).toEqual(
      expect.arrayContaining([
        ['装甲战象', '含攻城战象'],
        ['骑象射手', '含精锐'],
        ['象兵', '含精锐'],
      ]),
    );
    const byzantinesRegional = relatedRegionalUnitItems(civByEn('Byzantines')!, core.units, core.techs, core.fam);
    expect(byzantinesRegional.map((item) => [item.u.zh, item.upgradeLabel])).toEqual(
      expect.arrayContaining([
        ['瓦兰吉卫队', '含精锐'],
        ['德罗蒙战舰', undefined],
        ['骆驼兵', '含重装骆驼兵'],
      ]),
    );

    // 边界：无终阶或同 ID 返回 undefined
    const camel = core.unitById[329]!;
    expect(kitUpgradeLabel(camel, undefined, core.fam)).toBeUndefined();
    expect(kitUpgradeLabel(camel, camel, core.fam)).toBeUndefined();
  });

  it('文明详情颜色引用现有主题令牌，不另写一套固定深色', () => {
    const css = readFileSync('src/features/civs/components/civ-read.css', 'utf8');
    const tokens = readFileSync('src/shared/styles/tokens.css', 'utf8');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toContain('var(--color-bg)');
    expect(css).toContain('var(--color-text)');
    expect(css).toContain('var(--color-accent)');
    expect(css).toContain('var(--color-on-accent)');
    expect(css).toContain('var(--color-link)');
    expect(tokens).not.toMatch(/\.civ-read\s*\{/);
  });

  it('评分、位置和开局字段还在，优劣计算没有删掉', () => {
    const mongols = civByEn('Mongols');
    if (!mongols) throw new Error('Mongols');
    expect(mongols.s).toHaveLength(8);
    expect(typeof mongols.fl).toBe('number');
    expect(typeof mongols.pk).toBe('number');
    expect(mongols.op.length).toBeGreaterThan(0);
    const [pros, cons] = strengths(mongols);
    expect(pros).toHaveLength(3);
    expect(cons).toHaveLength(3);
  });
});
