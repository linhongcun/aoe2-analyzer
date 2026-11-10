import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ARMC_CLASS_NOTE, effectParts, techAffects } from '../../src/domain/affects';
import { DAT, toEffects } from '../../src/domain/datEffects';
import { damageByClass, damagePerHit, fighterFrom } from '../../src/domain/duel';
import { TECH_EFFECTS } from '../../src/domain/effects';
import { damageSources } from '../../src/domain/damageBreakdown';
import { simTechs, simulate } from '../../src/domain/simulator';
import { isMounted } from '../../src/domain/unitClass';
import { ArmorClasses } from '../../src/shared/ui/sim/SimPanel';
import { ctx, unit, units } from './helpers';

const LABEL = '村民';
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('#866 龙脉 armc', () => {
  it('只保留这一条护甲类别命令，并按类别名加入模拟', () => {
    const entry = DAT.techs['Royal Heirs'];
    expect(entry?.id).toBe(574);
    expect(entry?.combat).toBe(true);
    expect(entry?.rules).toEqual([
      {
        t: [207, 282, 329, 330, 556, 1007, 1009, 1016, 1018, 1263, 1755, 1923],
        fx: [{ s: 'armc', v: 3, vs: LABEL }],
      },
    ]);
    const decoded = toEffects(entry!.rules[0]!.fx);
    expect(decoded).toEqual([{ s: 'armc', vs: LABEL, v: 3 }]);
    expect(effectParts(decoded)[0]?.text).toBe('护甲类别「村民」+3');
    expect(TECH_EFFECTS['Royal Heirs']?.[0]?.[1]).toEqual(decoded);
    let armc = 0;
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const row = node as { s?: string };
      if (row.s === 'armc') armc += 1;
      Object.values(node).forEach(walk);
    };
    walk(DAT);
    expect(armc).toBe(1);
  });

  it('勾选后目标护甲从 -3 到 0，近战穿刺和目录价格不变', () => {
    const heirs = ctx.techByEn['Royal Heirs']!;
    expect(heirs.cost).toEqual({ Food: 300, Gold: 300 });
    expect(heirs.rt).toBe(40);
    for (const name of ['Shotel Warrior', 'Camel Rider', 'Flaming Camel'] as const) {
      const u = unit(name);
      const catalogCost = { ...u.cost };
      const off = simulate(ctx, u, 'Ethiopians', 3, new Set(), new Set());
      const on = simulate(ctx, u, 'Ethiopians', 3, new Set([574]), new Set());
      expect(off.armc[LABEL]).toBe(-3);
      expect(on.armc[LABEL]).toBe(0);
      expect(on.ma).toBe(off.ma);
      expect(on.pa).toBe(off.pa);
      expect(on.atk).toBe(off.atk);
      expect(on.hp).toBe(off.hp);
      expect(u.cost).toEqual(catalogCost);
      expect(simTechs(ctx, u, 'Ethiopians').find((row) => row.t.id === 574)?.ef).toEqual([{ s: 'armc', vs: LABEL, v: 3 }]);
    }
    expect(unit('Shotel Warrior').cost).toEqual({ Food: 50, Gold: 30 });
    expect(unit('Camel Rider').cost).toEqual({ Food: 55, Gold: 60 });
  });

  it('只改变带同一类别负攻击的伤害，不套到村民或没有该攻击的单位', () => {
    const shotel = unit('Shotel Warrior');
    const defend = (on: boolean) => fighterFrom(shotel, simulate(ctx, shotel, 'Ethiopians', 3, on ? new Set([574]) : new Set(), new Set()));
    const attack = (name: string) => fighterFrom(unit(name), simulate(ctx, unit(name), 'Britons', 3, new Set(), new Set()));
    const classRow = (name: string, on: boolean) => damageByClass(attack(name), defend(on)).find((row) => row.category === LABEL);

    expect(attack('Knight').attack[LABEL]).toBe(-3);
    expect(classRow('Knight', false)).toMatchObject({ attack: -3, armor: -3, damage: 0 });
    expect(classRow('Knight', true)).toMatchObject({ attack: -3, armor: 0, damage: -3 });
    expect(damagePerHit(attack('Knight'), defend(false)) - damagePerHit(attack('Knight'), defend(true))).toBe(3);

    for (const name of ['Man-at-Arms', 'Missionary'] as const) {
      expect(attack(name).attack).not.toHaveProperty(LABEL);
      expect(classRow(name, false)).toBeUndefined();
      expect(damagePerHit(attack(name), defend(false))).toBe(damagePerHit(attack(name), defend(true)));
    }

    const villager = fighterFrom(unit('Villager'), simulate(ctx, unit('Villager'), 'Ethiopians', 3, new Set([574]), new Set()));
    expect(villager.armor).not.toHaveProperty(LABEL);
    expect(damageByClass(attack('Knight'), villager).some((row) => row.category === LABEL)).toBe(false);
    expect(damagePerHit(attack('Knight'), villager)).toBe(10);

    const withAttack = units.filter((u) => u.atks.some(([name, value]) => name === LABEL && value === -3));
    const mountedWithout = units.filter((u) => isMounted(u) && !u.atks.some(([name]) => name === LABEL)).map((u) => u.id);
    expect(withAttack.every((u) => isMounted(u))).toBe(true);
    expect(mountedWithout.sort((a, b) => a - b)).toEqual([775, 1263, 1923]);
    expect(
      units
        .filter((u) => u.armc.some(([name]) => name === LABEL))
        .map((u) => u.id)
        .sort((a, b) => a - b),
    ).toEqual([207, 282, 329, 330, 556, 1007, 1009, 1016, 1018, 1263, 1755, 1923]);
  });

  it('科技页和护甲类别说明写出名称边界，骑士护甲列表不出现这条说明', () => {
    const shotel = unit('Shotel Warrior');
    const affects = techAffects(ctx.techByEn['Royal Heirs']!, units, []);
    expect(affects.flatMap((group) => group.rows.map((row) => row.effect))).toContain('护甲类别「村民」+3');
    expect(affects.flatMap((group) => group.rows.flatMap((row) => row.units.map((u) => u.id)))).toContain(shotel.id);
    const shown = text(
      renderToStaticMarkup(createElement(ArmorClasses, { list: Object.entries(simulate(ctx, shotel, 'Ethiopians', 3, new Set([574]), new Set()).armc) })),
    );
    expect(shown).toContain('村民 0');
    expect(shown).toContain(ARMC_CLASS_NOTE);
    expect(text(renderToStaticMarkup(createElement(ArmorClasses, { list: unit('Knight').armc })))).not.toContain('不是村民单位');
    const sources = damageSources(ctx, shotel, 'Ethiopians', 3, new Set([574]), new Set());
    expect(
      sources.sources.some(
        (source) => source.techId === 574 && source.changes.some((change) => change.stat === '护甲类别「村民」' && change.before === -3 && change.after === 0),
      ),
    ).toBe(true);
  });
});
