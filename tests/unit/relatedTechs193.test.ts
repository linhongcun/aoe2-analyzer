import { describe, expect, it } from 'vitest';
import { techAffects } from '../../src/domain/affects';
import { CIV_TECH_EXTRAS, GENERIC_FX } from '../../src/domain/effects';
import { unitRelatedTechs } from '../../src/domain/relatedTechs';
import { civStatus, makeSimContext, simTechs } from '../../src/domain/simulator';
import { ctx, tech, techs, unit, units } from './helpers';

const related = (en: string, civ?: string) => unitRelatedTechs(ctx, unit(en), civ);
const names = (en: string, civ?: string) => related(en, civ).map(({ t }) => t.en);

describe('#193 单位相关科技来自结构化作用对象', () => {
  it('骑士包含说明文字未逐字写出单位名的铁匠铺、血统和畜牧，并且不截断', () => {
    const result = names('Knight');
    expect(result).toEqual(expect.arrayContaining(['Forging', 'Bloodlines', 'Scale Barding Armor', 'Husbandry']));
    expect(result.length).toBeGreaterThan(6);
    expect(result).not.toContain('Fletching');
    expect(result).not.toContain('Scale Mail Armor');
    expect(result).not.toContain('Ballistics');
    expect(result).not.toContain('First Crusade');
  });

  it.each([
    ['Archer', ['Fletching', 'Padded Archer Armor', 'Thumb Ring'], ['Forging', 'Bloodlines', 'Scale Mail Armor']],
    ['Champion', ['Forging', 'Scale Mail Armor', 'Squires'], ['Fletching', 'Bloodlines', 'Husbandry']],
    ['Longbowman', ['Fletching', 'Yeomen', 'Bracer'], ['Forging', 'Bloodlines', 'Thumb Ring']],
    ['Elite Longbowman', ['Fletching', 'Yeomen', 'Bracer'], ['Forging', 'Bloodlines', 'Thumb Ring']],
    ['Huskarl', ['Forging', 'Scale Mail Armor', 'Squires'], ['Fletching', 'Bloodlines']],
    ['Elite Huskarl', ['Forging', 'Scale Mail Armor', 'Squires'], ['Fletching', 'Bloodlines']],
  ])('%s 按当前普通或精锐形态匹配', (en, yes, no) => {
    const result = names(en);
    yes.forEach((name) => expect(result).toContain(name));
    no.forEach((name) => expect(result).not.toContain(name));
  });

  it('全部科技到单位与单位到科技双向一致；只补充有结构化规则的文明限定作用', () => {
    for (const u of units) {
      const result = unitRelatedTechs(ctx, u);
      const owners = Object.keys(ctx.trees.t)
        .map((civ) => ({ civ, status: civStatus(ctx.trees, civ) }))
        .filter(({ civ, status }) => u.civs.includes(civ) || status['u' + u.id] === 1);
      expect(new Set(result.map(({ t }) => t.id)).size).toBe(result.length);
      for (const t of techs) {
        const direct = techAffects(t, [u], []).some((g) => !g.group.startsWith('组合触发') && g.rows.some((r) => r.units.some((x) => x.id === u.id)));
        const extra = Object.entries(CIV_TECH_EXTRAS).some(
          ([civ, rules]) => u.civs.includes(civ) && civStatus(ctx.trees, civ)['t' + t.id] === 1 && rules[t.en]?.some((x) => !x.b && x.pred(u) && x.fx.length),
        );
        expect(
          result.some((x) => x.t.id === t.id),
          `${u.en} / ${t.en}`,
        ).toBe((direct || extra) && owners.some(({ civ, status }) => status['t' + t.id] === 1 && (t.type !== 'UniqueTech' || t.civs.includes(civ))));
      }
    }
  });

  it('法兰克骑士保留可研究的通用科技，排除血统及其他文明独特科技', () => {
    const result = names('Knight', 'Franks');
    expect(result).toEqual(expect.arrayContaining(['Forging', 'Scale Barding Armor', 'Husbandry']));
    expect(result).not.toContain('Bloodlines');
    expect(result).not.toContain('Farimba');
    expect(result).not.toContain('Chivalry'); // 生产速度尚未建模，不声称有数值作用。
    expect(names('Knight', 'Malians')).toContain('Farimba');
    expect(names('Knight', 'Aztecs')).toEqual([]);
  });

  it('通用视角标明独特科技和文明附加效果的所属文明', () => {
    expect(related('Knight').find(({ t }) => t.en === 'Farimba')?.civs).toEqual(['Malians']);
    expect(related('Knight').find(({ t }) => t.en === 'Forging')?.civs).toEqual([]);
    expect(related('Villager').find(({ t }) => t.en === 'Forging')?.civs).toEqual(['Incas']);
    expect(names('Villager', 'Incas')).toContain('Forging');
    expect(names('Villager', 'Chinese')).not.toContain('Forging');
  });

  it('通用视角要求科技与单位可在同一文明出现，不把广类别科技列给其他文明独特兵', () => {
    expect(names('Longbowman')).toContain('Yeomen');
    expect(names('Chu Ko Nu')).not.toContain('Yeomen');
    expect(names('Plumed Archer')).not.toContain('Yeomen');
    expect(names('Cataphract')).not.toContain('Bloodlines');
    for (const u of units) {
      for (const { t, civs } of unitRelatedTechs(ctx, u)) {
        if (t.type !== 'UniqueTech') continue;
        expect(civs.length, `${u.en} / ${t.en}`).toBeGreaterThan(0);
        for (const civ of civs) {
          expect(u.civs.includes(civ) || civStatus(ctx.trees, civ)['u' + u.id] === 1).toBe(true);
          expect(t.civs).toContain(civ);
          expect(civStatus(ctx.trees, civ)['t' + t.id]).toBe(1);
        }
      }
    }
  });

  it('每个文明下都与模拟器数值项一致，不把未建模独特科技当成已生效', () => {
    for (const en of ['Knight', 'Archer', 'Champion', 'Longbowman', 'Elite Longbowman', 'Huskarl', 'Elite Huskarl', 'Villager']) {
      const u = unit(en);
      for (const civ of u.civs) {
        const result = names(en, civ);
        expect(result, `${en} / ${civ}`).toEqual(
          simTechs(ctx, u, civ)
            .filter((x) => x.ef?.length)
            .map(({ t }) => t.en),
        );
        for (const { t } of related(en, civ)) expect(civStatus(ctx.trees, civ)['t' + t.id], `${en} / ${civ} / ${t.en}`).toBe(1);
      }
    }
  });

  it('改变说明文本不会改变关联结果', () => {
    const textOnly = tech('Ballistics');
    const changed = { ...ctx, techs: ctx.techs.map((t) => ({ ...t, desc: t.id === textOnly.id ? '骑士生命值 +999' : '' })) };
    expect(unitRelatedTechs(changed, unit('Knight')).map(({ t, civs }) => ({ id: t.id, civs }))).toEqual(
      related('Knight').map(({ t, civs }) => ({ id: t.id, civs })),
    );
  });

  it('未知文明、空科技库或没有可用文明时返回空列表', () => {
    expect(names('Knight', 'Unknown')).toEqual([]);
    expect(unitRelatedTechs(makeSimContext([], ctx.trees), unit('Knight'))).toEqual([]);
    expect(unitRelatedTechs(makeSimContext(ctx.techs, { ...ctx.trees, t: {} }), unit('Knight'))).toEqual([]);
  });

  it('组合触发的科技不会作为无条件单项关联', () => {
    GENERIC_FX.push({
      tech: -193,
      name: 'test conditional rule',
      age: 4,
      req: ['Ballistics', 'Bloodlines'],
      pred: (x) => x.id === unit('Knight').id,
      fx: [{ s: 'hp', v: 1 }],
      b: false,
    });
    try {
      expect(techAffects(tech('Ballistics'), [unit('Knight')], []).some((g) => g.group.startsWith('组合触发'))).toBe(true);
      expect(names('Knight')).not.toContain('Ballistics');
      expect(names('Knight', 'Chinese')).not.toContain('Ballistics');
    } finally {
      GENERIC_FX.pop();
    }
  });
});
