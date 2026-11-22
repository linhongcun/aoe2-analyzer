import { describe, expect, it } from 'vitest';
import civs from '../../data/game/civs.json';
import { DUEL_SEED_CANDIDATES, matchupComparePath, matchupDuelPath, pickDefaultDuelUnit, type DuelSeedData } from '../../src/domain/matchupDuelSeed';
import type { Trees, Unit } from '../../src/domain/types';
import { unitAvailable } from '../../src/domain/unitAvailability';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { ctx, trees, units } from './helpers';

const unitById: Record<number, Unit> = Object.fromEntries(units.map((u) => [u.id, u]));
const data: DuelSeedData = { core: { units, unitById }, trees };

function onlyUnitsTree(civ: string, allowedIds: readonly number[]): DuelSeedData {
  const allowed = new Set(allowedIds);
  const changed: Trees = structuredClone(trees);
  for (const block of changed.t[civ]!) {
    block[3] = block[3].filter((cell) => cell[2] !== 'u' || allowed.has(cell[3]));
  }
  return { core: data.core, trees: changed };
}

describe('#1284 对局助手 56 文明合法默认 PK 单位与带参路由', () => {
  it('全部 56 文明在帝王时代均命中合法可用单位，且进入 PK resolve 零不可用红框', () => {
    expect(civs).toHaveLength(56);
    for (const civ of civs) {
      const uid = pickDefaultDuelUnit(data, civ.en, 4);
      expect(uid, `${civ.en} 应命中合法单位`).not.toBeNull();
      expect(DUEL_SEED_CANDIDATES).toContain(uid!);
      expect(unitAvailable(data, civ.en, uid!, 4), `${civ.en} u${uid} 科技树应可用`).toBe(true);
      const u = unitById[uid!]!;
      expect(u.civs).toContain(civ.en);
      expect(u.hp).toBeGreaterThan(0);
      expect(u.atk).toBeGreaterThan(0);
      expect(u.rof).toBeGreaterThan(0);
      const state = resolve(ctx, unitById, { uid: uid!, civ: civ.en, age: 4, techs: 'f', team: [] }, 569);
      expect(isUnavail(state), `${civ.en} u${uid} 不应落入 PK 不可用态`).toBe(false);
    }
  });

  it('15 个无骑士文明与 2 个无重装骑士文明落点准确，杜绝阿兹特克/玛雅等死路反例', () => {
    const expected: Record<string, number> = {
      Franks: 569,
      Britons: 283,
      Persians: 283,
      Danes: 38,
      Saracens: 38,
      Aztecs: 492,
      Mayans: 492,
      Incas: 492,
      Muisca: 492,
      Tupi: 492,
      Bengalis: 492,
      Dravidians: 492,
      Shu: 492,
      Wu: 492,
      Gurjaras: 330,
      Hindustanis: 330,
      Jurchens: 1372,
      Khitans: 1372,
      Mapuche: 2554,
      Wei: 1946,
    };
    for (const [civ, uid] of Object.entries(expected)) {
      expect(pickDefaultDuelUnit(data, civ, 4), civ).toBe(uid);
    }
  });

  it('全 1–4 时代 56 文明均直接命中合法单位，未知文明或非法时代返回 null', () => {
    for (const age of [1, 2, 3, 4]) {
      for (const civ of civs) {
        const uid = pickDefaultDuelUnit(data, civ.en, age);
        expect(uid, `${civ.en} age=${age}`).not.toBeNull();
        expect(unitAvailable(data, civ.en, uid!, age), `${civ.en} age=${age} u${uid}`).toBe(true);
      }
    }
    expect(pickDefaultDuelUnit(data, 'Incas', 1)).toBe(2550);
    expect(pickDefaultDuelUnit(data, 'Mapuche', 1)).toBe(2550);
    expect(pickDefaultDuelUnit(data, 'Muisca', 1)).toBe(2550);
    expect(pickDefaultDuelUnit(data, 'Tupi', 1)).toBe(2550);
    expect(pickDefaultDuelUnit(data, 'Unknown', 4)).toBeNull();
    expect(pickDefaultDuelUnit(data, '', 4)).toBeNull();
    expect(pickDefaultDuelUnit(data, 'Franks', 0)).toBeNull();
    expect(pickDefaultDuelUnit(data, 'Franks', 5)).toBeNull();
  });

  it('三层动态兜底在候选全不可用时跳过 rof=0 自爆单位，并按战斗单位、攻击单位、任意可用单位依次降级', () => {
    // Tatars 拥有 1263 火焰骆驼 (rof=0, atk>0) 与 542 劲弩手替代外的攻城/特色兵，例如 1228 怯薛 (rof>0) 与 125 僧侣 (atk=0)
    const exploding = unitById[1263]!;
    expect(exploding.rof).toBe(0);
    expect(exploding.atk).toBeGreaterThan(0);
    const keshik = unitById[1228]!;
    expect(keshik.rof).toBeGreaterThan(0);
    expect(keshik.civs).toContain('Tatars');
    const monk = unitById[125]!;
    expect(monk.atk).toBe(0);

    // 仅剩自爆单位(1263) + 常规攻击单位(1228) + 僧侣(125)：首层跳过 1263 命中 1228
    expect(pickDefaultDuelUnit(onlyUnitsTree('Tatars', [1263, 1228, 125]), 'Tatars', 4)).toBe(1228);
    // 仅剩自爆单位(1263) + 僧侣(125)：次层命中 hp>0 && atk>0 的 1263
    expect(pickDefaultDuelUnit(onlyUnitsTree('Tatars', [1263, 125]), 'Tatars', 4)).toBe(1263);
    // 仅剩非攻击单位(125)：末层兜底命中 125
    expect(pickDefaultDuelUnit(onlyUnitsTree('Tatars', [125]), 'Tatars', 4)).toBe(125);
    // 全无可用单位：返回 null
    expect(pickDefaultDuelUnit(onlyUnitsTree('Tatars', []), 'Tatars', 4)).toBeNull();
  });

  it('严守 #888 红线：起始单位仅由单侧文明决定，不随对手变化', () => {
    const vsFranks = new URLSearchParams(matchupDuelPath(data, 'Aztecs', 'Franks')!.split('?')[1]);
    const vsBritons = new URLSearchParams(matchupDuelPath(data, 'Aztecs', 'Britons')!.split('?')[1]);
    const vsMayans = new URLSearchParams(matchupDuelPath(data, 'Aztecs', 'Mayans')!.split('?')[1]);
    expect(vsFranks.get('a')).toBe('492.Aztecs.4.f.');
    expect(vsBritons.get('a')).toBe('492.Aztecs.4.f.');
    expect(vsMayans.get('a')).toBe('492.Aztecs.4.f.');
    expect(vsFranks.get('b')).toBe('569.Franks.4.f.');
    expect(vsBritons.get('b')).toBe('283.Britons.4.f.');
    expect(vsMayans.get('b')).toBe('492.Mayans.4.f.');
  });

  it('matchupDuelPath 与 matchupComparePath 正确处理正常、镜像、缺方与资料未就绪边界', () => {
    expect(matchupDuelPath(data, 'Franks', 'Britons')).toBe('/duel?a=569.Franks.4.f.&b=283.Britons.4.f.&m=1&me=Franks&opp=Britons');
    expect(matchupDuelPath(data, 'Franks', 'Franks')).toBe('/duel?a=569.Franks.4.f.&b=569.Franks.4.f.&m=1&me=Franks&opp=Franks');
    expect(matchupDuelPath(null, 'Franks', 'Britons')).toBeNull();
    expect(matchupDuelPath(data, 'Franks', null)).toBeNull();
    expect(matchupDuelPath(data, null, 'Britons')).toBeNull();
    expect(matchupDuelPath(data, 'Unknown', 'Britons')).toBeNull();

    expect(matchupComparePath('Franks', 'Britons')).toBe('/compare?a=Franks&b=Britons');
    expect(matchupComparePath('Franks', 'Franks')).toBeNull();
    expect(matchupComparePath('Franks', null)).toBeNull();
    expect(matchupComparePath(null, 'Britons')).toBeNull();
    expect(matchupComparePath('Unknown', 'Britons')).toBeNull();
  });
});
