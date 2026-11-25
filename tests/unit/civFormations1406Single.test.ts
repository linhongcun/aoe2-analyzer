import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { countForBudget, groupFight } from '../../src/domain/duel';
import { decodeDuelKite, decodeDuelParams } from '../../src/domain/duelParams';
import { parseSide } from '../../src/domain/duelState';
import { makeSimContext } from '../../src/domain/simulator';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';

const route = (civ: string, id: string) => civFormationContent.find((e) => e.civ === civ)!.routes.find((r) => r.id === id)!;

interface SingleCase {
  civ: string;
  id: string;
  label: string;
  ka: boolean;
  kb: boolean;
  w: 'a' | 'b';
  alive: number;
  init: number;
  ret: number;
  cap?: boolean;
  hp?: number;
  full?: boolean;
}

const s = (
  civ: string,
  id: string,
  label: string,
  ka: boolean,
  kb: boolean,
  w: 'a' | 'b',
  alive: number,
  init: number,
  ret: number,
  opts?: { cap?: boolean; hp?: number; full?: boolean },
): SingleCase => ({ civ, id, label, ka, kb, w, alive, init, ret, ...opts });

const SINGLE_CASES: readonly SingleCase[] = [
  s(
    'Chinese',
    'china-chu-ko-nu',
    '预算 3000 · 40 名精锐诸葛弩 拉扯对 42 名日本冠军剑士（40/40 满血零损，后撤 18.8 格，未计副弹）',
    true,
    false,
    'a',
    40,
    40,
    18.8,
    { hp: 2000, full: true },
  ),
  s(
    'Chinese',
    'china-chu-ko-nu',
    '预算 3000 · 40 名精锐诸葛弩 拉扯对 50 名法兰克长戟兵（40/40 满血零损，后撤 12.5 格，未计副弹）',
    true,
    false,
    'a',
    40,
    40,
    12.5,
    { hp: 2000, full: true },
  ),
  s('Chinese', 'china-chu-ko-nu', '预算 3000 · 40 名精锐诸葛弩 拉扯对法兰克游侠 22 名（剩 26/40，后撤 9.8 格，未计副弹）', true, false, 'a', 26, 40, 9.8),
  s('Chinese', 'china-chu-ko-nu', '预算 3000 · 40 名精锐诸葛弩 拉扯对哥特精锐近卫军 38 名（剩 24/40，后撤 20.9 格，未计副弹）', true, false, 'a', 24, 40, 20.9),
  s('Hindustanis', 'hindustani-handcannon-hussar', '预算 3000 · 31 名火枪手 拉扯对 42 名日本劲弩手（剩 23/31，后撤 20.8 格）', true, false, 'a', 23, 31, 20.8),
  s(
    'Hindustanis',
    'hindustani-handcannon-hussar',
    '预算 3000 · 31 名火枪手 拉扯对 50 名日本精锐掷矛手（31/31 满血零损，后撤 26.8 格）',
    true,
    false,
    'a',
    31,
    31,
    26.8,
    { hp: 1240, full: true },
  ),
  s(
    'Hindustanis',
    'hindustani-handcannon-hussar',
    '预算 3000 · 31 名火枪手 拉扯对 31 名西班牙火枪手（31/31 满血零损，后撤 11.9 格）',
    true,
    false,
    'a',
    31,
    31,
    11.9,
    { hp: 1240, full: true },
  ),
  s(
    'Hindustanis',
    'hindustani-camel-ghulam-field',
    '预算 3000 · 精锐古拉姆 40 名站桩对拉扯 42 名不列颠劲弩手（剩 14/40，敌后撤 16.1 格，未计溅射）',
    false,
    true,
    'a',
    14,
    40,
    16.1,
  ),
  s(
    'Hindustanis',
    'hindustani-camel-ghulam-field',
    '预算 3000 · 30 名重装骑射手 站桩对拉扯 42 名日本劲弩手（敌剩 28/42，敌后撤 15.6 格）',
    false,
    true,
    'b',
    28,
    42,
    15.6,
  ),
  s(
    'Persians',
    'persian-savar-crossbow-bombard',
    '预算 3000 · 萨瓦尔 22 名站桩对拉扯 42 名不列颠劲弩手（剩 11/22，敌后撤 12.7 格）',
    false,
    true,
    'a',
    11,
    22,
    12.7,
  ),
  s(
    'Malians',
    'malians-light-cavalry-gbeto',
    '预算 3000 · 33 名精锐飞刀女兵 拉扯对 50 名法兰克长戟兵（33/33 零阵亡，剩 1615 血，后撤 9.6 格）',
    true,
    false,
    'a',
    33,
    33,
    9.6,
    { hp: 1615 },
  ),
  s(
    'Malians',
    'malians-light-cavalry-gbeto',
    '预算 3000 · 33 名精锐飞刀女兵 拉扯对哥特精锐近卫军 38 名（剩 32/33，后撤 8.3 格）',
    true,
    false,
    'a',
    32,
    33,
    8.3,
  ),
  s(
    'Malians',
    'malians-light-cavalry-gbeto',
    '预算 3000 · 33 名精锐飞刀女兵 拉扯对 42 名日本冠军剑士（剩 31/33，后撤 11.0 格）',
    true,
    false,
    'a',
    31,
    33,
    11.0,
  ),
  s('Malians', 'malians-light-cavalry-gbeto', '预算 3000 · 33 名精锐飞刀女兵 拉扯对法兰克游侠 22 名（剩 22/33，后撤 4.1 格）', true, false, 'a', 22, 33, 4.1),
  s(
    'Malians',
    'malians-light-cavalry-gbeto',
    '预算 3000 · 33 名精锐飞刀女兵 站桩对拉扯 50 名日本精锐掷矛手（剩 16/33，敌后撤 22.0 格）',
    false,
    true,
    'a',
    16,
    33,
    22.0,
    { hp: 779 },
  ),
  s(
    'Malians',
    'malians-light-cavalry-gbeto',
    '预算 3000 · 33 名精锐飞刀女兵 拉扯对 26 名精锐条顿骑士（敌剩 11/26，后撤 40.0 格触顶）',
    true,
    false,
    'b',
    11,
    26,
    40.0,
    { cap: true },
  ),
  s(
    'Malians',
    'malians-light-cavalry-gbeto',
    '预算 3000 · 33 名精锐飞刀女兵 站桩对拉扯 42 名不列颠劲弩手（敌剩 40/42，敌后撤 11.1 格）',
    false,
    true,
    'b',
    40,
    42,
    11.1,
  ),
  s(
    'Malians',
    'malians-farimba-cav-champ-field',
    '预算 3000 · 42 名冠军剑士 站桩对拉扯 42 名不列颠劲弩手（敌剩 8/42，敌后撤 33.4 格）',
    false,
    true,
    'b',
    8,
    42,
    33.4,
  ),
  s(
    'Malians',
    'malians-farimba-cav-champ-field',
    '预算 3000 · 42 名冠军剑士 站桩对拉扯 42 名中国劲弩手（敌剩 14/42，敌后撤 20.9 格）',
    false,
    true,
    'b',
    14,
    42,
    20.9,
  ),
  s(
    'Malay',
    'malay-battle-elephant-progression',
    '预算 3000 · 42 名劲弩手 拉扯对 50 名法兰克长戟兵（42/42 满血零损，后撤 10.4 格）',
    true,
    false,
    'a',
    42,
    42,
    10.4,
    { hp: 1680, full: true },
  ),
  s('Malay', 'malay-battle-elephant-progression', '预算 3000 · 42 名劲弩手 拉扯对 42 名日本冠军剑士（剩 39/42，后撤 20.9 格）', true, false, 'a', 39, 42, 20.9),
  s('Malay', 'malay-battle-elephant-progression', '预算 3000 · 42 名劲弩手 拉扯对 27 只马来精锐象兵（剩 29/42，后撤 27.4 格）', true, false, 'a', 29, 42, 27.4),
];

describe('#1406 第二档六国升级：22 条单兵拉扯与反拉扯链接全量实算', () => {
  it('全部 22 条新增单兵拉扯/反拉扯链接与 DE 188329 引擎实算严格一致（含精确 hpLeft 与飞刀 1615/1650）', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const ctx = makeSimContext(core.techs, trees);
    expect(SINGLE_CASES).toHaveLength(22);

    for (const c of SINGLE_CASES) {
      const link = route(c.civ, c.id).evidence.links?.find((item) => item.label === c.label);
      expect(link, `${c.civ}/${c.id} missing ${c.label}`).toBeDefined();
      const params = new URLSearchParams(new URL(link!.href).hash.split('?')[1] ?? '');
      const decoded = decodeDuelParams(params);
      const kite = decodeDuelKite(params);
      expect([decoded.mode, decoded.bud, kite.a, kite.b], c.label).toEqual(['r', 3000, c.ka, c.kb]);

      const sideA = resolve(ctx, core.unitById, parseSide(params.get('a'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      const sideB = resolve(ctx, core.unitById, parseSide(params.get('b'), { uid: 1, civ: '', age: 4, techs: 'f', team: [] }), 1);
      expect([isUnavail(sideA), isUnavail(sideB)], c.label).toEqual([false, false]);
      if (isUnavail(sideA) || isUnavail(sideB)) continue;

      const na = countForBudget(sideA.training.price.cost, decoded.bud)!;
      const nb = countForBudget(sideB.training.price.cost, decoded.bud)!;
      const res = groupFight(sideA.F, na, sideB.F, nb, { kite: { a: c.ka, b: c.kb } });
      expect(res.status, c.label).toBe('win');
      if (res.status !== 'win') continue;
      expect(res.winner, c.label).toBe(c.w);
      const alive = c.w === 'a' ? res.aAlive : res.bAlive;
      const init = c.w === 'a' ? na : nb;
      expect([alive, init], c.label).toEqual([c.alive, c.init]);

      const ks = c.ka ? res.contact.kite?.a : res.contact.kite?.b;
      expect(ks, c.label).toBeDefined();
      expect(Number(ks!.retreated.toFixed(1)), c.label).toBe(c.ret);
      expect(ks!.capHit, c.label).toBe(Boolean(c.cap));

      if (c.hp !== undefined) expect(Math.round(res.hpLeft), c.label).toBe(c.hp);
      if (c.full) expect(res.hpLeft, c.label).toBe(init * (c.w === 'a' ? sideA.F.hp : sideB.F.hp));
      else if (c.hp === 1615) expect(res.hpLeft, 'Gbeto vs Halb 1615 < 1650').toBeLessThan(na * sideA.F.hp);
    }
  });
});
