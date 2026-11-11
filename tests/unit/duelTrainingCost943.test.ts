import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countForBudget } from '../../src/domain/duel';
import { applicableTrainingTechs, quoteTraining } from '../../src/domain/duelTrainingCost';
import { unitCost } from '../../src/domain/unitCost';
import { presetUpTo, simulate } from '../../src/domain/simulator';
import { contextSearchAfterCanon } from '../../src/features/duel/logic/duelContext';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { DUEL_COST_MODEL, trainingLines } from '../../src/features/duel/logic/trainingCostView';
import { ctx, techs, unit, units } from './helpers';

const byId = Object.fromEntries(units.map((item) => [item.id, item]));
const techByEn = (en: string) => techs.find((item) => item.en === en)!;
const side = (uid: number, civ: string, age: number, selected: 'f' | 'c' | number[]) => {
  const resolved = resolve(ctx, byId, { uid, civ, age, techs: selected, team: [] }, uid);
  if (isUnavail(resolved)) throw new Error(`${civ} ${uid} unavailable`);
  return resolved;
};

describe('#943 单位 PK 训练价', () => {
  const kamandaran = techByEn('Kamandaran');
  const butalmapu = techByEn('Butalmapu');
  const crossbow = unit('Crossbowman');
  const archer = unit('Archer');
  const savar = unit('Savar');
  const cavalryArcher = unit('Cavalry Archer');
  const bolas = unit('Bolas Rider');

  it('满科技的波斯弩手套用已支持费用科技，萨瓦尔与骑射手不套', () => {
    const bow = side(crossbow.id, 'Persians', 4, 'f');
    expect(bow.training.price.cost).toMatchObject({ Wood: 50, Gold: 0 });
    expect(bow.training.before).toMatchObject({ Wood: 25, Gold: 45 });
    expect(bow.F.cost).toEqual(bow.training.price.cost);
    expect(bow.sel.has(kamandaran.id)).toBe(true);
    expect(bow.training.price.appliedTechs.map((item) => item.id)).toContain(kamandaran.id);
    expect(bow.training.price.cost.Food).toBeUndefined();

    const foot = side(archer.id, 'Persians', 4, 'f');
    expect(foot.training.price.cost).toMatchObject({ Wood: 50, Gold: 0 });
    expect(foot.sel.has(kamandaran.id)).toBe(true);

    const feudal = side(archer.id, 'Persians', 2, 'f');
    expect(feudal.sel.has(kamandaran.id)).toBe(false);
    expect(feudal.training.price.cost).toMatchObject({ Wood: 25, Gold: 45 });

    const horse = side(savar.id, 'Persians', 4, 'f');
    expect(horse.training.costs).toEqual([]);
    expect(horse.sel.has(kamandaran.id)).toBe(false);
    expect(horse.training.price.cost).toEqual({ Food: 60, Gold: 75 });

    const mounted = side(cavalryArcher.id, 'Persians', 4, 'f');
    expect(mounted.training.costs.some((item) => item.tech.id === kamandaran.id)).toBe(false);
    expect(mounted.training.price.cost).toMatchObject({ Wood: 40, Gold: 60 });
  });

  it('显式 id 可计入或撤销，非波斯误选不改价；战斗属性不因费用科技改变', () => {
    const priced = side(crossbow.id, 'Persians', 4, [kamandaran.id]);
    expect(priced.training.price.cost).toMatchObject({ Wood: 50, Gold: 0 });
    const combatOnly = presetUpTo(priced.avail, 4);
    expect(combatOnly.has(kamandaran.id)).toBe(false);
    const revoked = side(crossbow.id, 'Persians', 4, [...combatOnly]);
    expect(revoked.training.price.cost).toMatchObject({ Wood: 25, Gold: 45 });
    expect(trainingLines(revoked.training, revoked.sel).lines.map((line) => line.text)).toContain('可计入未勾选：波斯步弓手');

    const foreign = side(crossbow.id, 'Britons', 4, [kamandaran.id]);
    expect(foreign.sel.has(kamandaran.id)).toBe(false);
    expect(foreign.training.price.cost).toMatchObject({ Wood: 25, Gold: 45 });

    const full = side(crossbow.id, 'Persians', 4, 'f');
    const combat = simulate(ctx, crossbow, 'Persians', 4, combatOnly, new Set());
    expect(full.S.hp).toBe(combat.hp);
    expect(full.S.atk).toBe(combat.atk);
    expect(full.S.ma).toBe(combat.ma);
    expect(full.S.pa).toBe(combat.pa);
    expect(full.S.rof).toBe(combat.rof);
    expect(full.S.rng).toBe(combat.rng);
  });

  it('默认预算按当时单价下取整，研究费用不进入单价', () => {
    const savarSide = side(savar.id, 'Persians', 4, 'f');
    const withTech = side(crossbow.id, 'Persians', 4, 'f');
    const without = side(crossbow.id, 'Persians', 4, []);
    expect(countForBudget(savarSide.training.price.cost, 3000)).toBe(22);
    expect(countForBudget(withTech.training.price.cost, 3000)).toBe(60);
    expect(countForBudget(without.training.price.cost, 3000)).toBe(42);
    expect(countForBudget(withTech.training.price.cost, 1000)).toBe(20);
  });

  it('布图马普满科技默认未选，手选只记录且价格不变', () => {
    const costs = applicableTrainingTechs(ctx, bolas, 'Mapuche', 4);
    const item = costs.find((row) => row.tech.id === butalmapu.id);
    expect(item?.supported).toBe(false);
    const full = side(bolas.id, 'Mapuche', 4, 'f');
    expect(full.sel.has(butalmapu.id)).toBe(false);
    expect(full.training.price.cost).toEqual({ Wood: 50, Gold: 55 });
    const off = trainingLines(full.training, full.sel).lines.find((line) => line.id === butalmapu.id);
    expect(off).toMatchObject({
      state: 'off',
      text: '未计入：布图马普，本站尚不支持，当前价格不是完整效果后的最终价',
    });

    const recorded = side(bolas.id, 'Mapuche', 4, [butalmapu.id]);
    expect(recorded.training.price.cost).toEqual(full.training.price.cost);
    expect(trainingLines(recorded.training, recorded.sel).lines.find((line) => line.id === butalmapu.id)?.state).toBe('recorded');
    const note = trainingLines(full.training, full.sel).notes.find((line) => line.includes('布图马普'));
    expect(note).toContain('满科技不会自动勾选');
    expect(note).toContain('未选择不等于已研究');
    expect(note).toContain(`${butalmapu.cost.Food} 食物`);
    expect(note).toContain(`${butalmapu.rt} 秒`);
  });

  it('已计入短句和一次研究说明来自数据，页脚不再写旧句', () => {
    const full = side(crossbow.id, 'Persians', 4, 'f');
    const view = trainingLines(full.training, full.sel);
    expect(view.lines.find((line) => line.id === kamandaran.id)?.text).toBe('已计入：波斯步弓手（木材 +25，黄金 −45）');
    expect(view.notes.find((line) => line.startsWith('一次研究：波斯步弓手'))).toBe(
      `一次研究：波斯步弓手 ${kamandaran.cost.Food} 食物 ${kamandaran.cost.Gold} 黄金，${kamandaran.rt} 秒。这笔费用不摊进每名训练价，也不从派出预算里扣除。`,
    );
    expect(DUEL_COST_MODEL).not.toContain('需研究的科技折扣不计入');
    expect(DUEL_COST_MODEL).toContain('一次研究费用不摊进每名训练价，也不从派出预算里扣除。');
    const page = readFileSync('src/features/duel/components/Duel.tsx', 'utf8');
    const upgrade = readFileSync('src/features/duel/components/UpgradeComparison.tsx', 'utf8');
    expect(page).not.toContain('需研究的科技折扣不计入');
    expect(page).not.toContain('属性示意');
    expect(page).not.toContain('战斗结果待实现计算');
    expect(upgrade).toContain('单位训练费用（基础价）');
    expect(upgrade).not.toContain('已选科技后');
  });

  it('适用费用科技按运行时效果收集，报价与 unitCost 相同', () => {
    const found = applicableTrainingTechs(ctx, crossbow, 'Persians', 4).filter((item) => item.supported);
    expect(found.length).toBeGreaterThan(0);
    const quote = quoteTraining(crossbow, 'Persians', 4, new Set(found.map((item) => item.tech.id)), found);
    const direct = unitCost(
      crossbow,
      'Persians',
      4,
      found.map((item) => ({ id: item.tech.id, en: item.tech.en, zh: item.tech.zh })),
    );
    expect(quote.price.cost).toEqual(direct.cost);
    expect(quote.price.appliedTechs.map((item) => item.id)).toEqual(direct.appliedTechs.map((item) => item.id));
  });

  it('规范化写回后语境链读已写入的查询串', () => {
    expect(contextSearchAfterCanon('a=1', 'a=1', 'a=2')).toBe('a=2');
    expect(contextSearchAfterCanon('a=2', 'a=2', 'a=2')).toBeNull();
    expect(contextSearchAfterCanon('a=1', 'a=9', 'a=9')).toBe('a=9');
  });
});
