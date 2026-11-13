import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { civByEn, civs, loadCore, type Core } from '../../src/data';
import { civUniqueTechs, civUniqueUnits, relatedRegionalLines } from '../../src/domain/civKit';
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
    const techs = civUniqueTechs(civByEn('Mongols')!, core.techs);
    expect(techs.map((item) => item.tech.id)).toEqual([487, 6]);
  });

  it('拜占庭带上加成或独特科技点名的瓦兰吉卫队、德罗蒙和骆驼兵', () => {
    expect(bases('Byzantines').sort()).toEqual(['德罗蒙战舰', '瓦兰吉卫队', '骆驼兵'].sort());
    const techs = civUniqueTechs(civByEn('Byzantines')!, core.techs);
    expect(techs.map((item) => item.zh)).toEqual(['希腊之火', '后勤学']);
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
