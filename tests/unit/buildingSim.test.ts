import { describe, expect, it } from 'vitest';
import raw from '../../data/game/buildings.json';
import { civs } from '../../src/data';
import { buildingBase, buildingSimTechs, simulateBuilding } from '../../src/domain/buildingSim';
import { matchingGenericFx } from '../../src/domain/effects';
import { formatHp } from '../../src/domain/hpFormat';
import { buildingType } from '../../src/domain/buildings';
import { applicableSimCostTechs, mergeSimCostTechs } from '../../src/domain/simEffectiveCost';
import { allNumeric } from '../../src/domain/simulator';
import type { Building, Effect } from '../../src/domain/types';
import { ctx, tech } from './helpers';

const bs = (raw as unknown as Building[]).map((b) => ({ ...b, dlc: null, type: buildingType(b.en) }));
const B = (en: string) => bs.find((b) => b.en === en)!;
const full = (en: string, civ: string) => {
  const b = B(en);
  return simulateBuilding(ctx, b, civ, 4, allNumeric(buildingSimTechs(ctx, b, civ)));
};
const ids = (...n: string[]) => new Set(n.map((x) => tech(x).id));

describe('building simulator (values vs AoE2 Fandom Wiki)', () => {
  it('Castle + Masonry + Architecture + Hoardings 保留连乘小数，展示为 7027.68', () => {
    const hp = simulateBuilding(ctx, B('Castle'), 'Franks', 4, ids('Masonry', 'Architecture', 'Hoardings')).hp;
    expect(hp).toBeCloseTo(7027.68, 6);
    expect(formatHp(hp)).toBe('7027.68');
  });
  it('Byzantine Imperial Castle with Hoardings 保留连乘小数，展示为 8130.71', () => {
    const hp = simulateBuilding(ctx, B('Castle'), 'Byzantines', 4, ids('Hoardings')).hp;
    expect(hp).toBeCloseTo(8130.707818128878, 6);
    expect(formatHp(hp)).toBe('8130.71');
  });
  it('Britons Castle full tech: armor 10/13, +6 building armor, attack 15, range 11, no min range', () => {
    const s = full('Castle', 'Britons');
    expect(s.hp).toBeCloseTo(7027.68, 6);
    expect([s.ma, s.pa, s.barm]).toEqual([10, 13, 14]); // barm: 基础 8 + Masonry 3 + Architecture 3（.dat 类别 11）
    expect([s.atk, s.rng, s.minr]).toEqual([15, 11, 0]);
    expect(s.bonus['船只']).toBe(4);
  });
  it('Keep with Fletching + Bodkin + Bracer: range +3, attack +3 (+3 Arrowslits)', () => {
    const k = B('Keep'),
      civ = k.civs.find((c) => c === 'Britons') ?? k.civs[0]!;
    const s = simulateBuilding(ctx, k, civ, 4, ids('Fletching', 'Bodkin Arrow', 'Bracer'));
    expect(s.rng).toBe(k.rng + 3);
    expect(s.atk).toBe(k.atk + 3);
    expect(s.los).toBe(k.los + 3);
    const sa = simulateBuilding(ctx, k, civ, 4, ids('Arrowslits'));
    if (buildingSimTechs(ctx, k, civ).some((x) => x.t.en === 'Arrowslits')) expect(sa.atk).toBe(k.atk + 3);
  });
  it('Town Center: fletching line gives attack only, no range', () => {
    const tc = B('Town Center');
    const s = simulateBuilding(ctx, tc, 'Britons', 4, ids('Fletching', 'Bodkin Arrow', 'Bracer'));
    expect([s.atk, s.rng]).toEqual([tc.atk + 3, tc.rng]);
  });
  it('civ bonuses: Teutons TC garrison +10, Persians TC HP x2, Spanish build speed +30%', () => {
    expect(simulateBuilding(ctx, B('Town Center'), 'Teutons', 4, new Set()).gar).toBe(B('Town Center').gar + 10);
    expect(simulateBuilding(ctx, B('Town Center'), 'Persians', 4, new Set()).hp).toBe(4800);
    expect(simulateBuilding(ctx, B('House'), 'Spanish', 1, new Set()).bt).toBeCloseTo(B('House').bt / 1.3, 1);
  });
  it('techs only offered when the civ has them; line upgrades are text-only', () => {
    const av = buildingSimTechs(ctx, B('Castle'), 'Aztecs');
    expect(av.some((x) => x.t.en === 'Hoardings')).toBe(false);
    const wt = buildingSimTechs(ctx, B('Watch Tower'), 'Britons').find((x) => x.t.en === 'Guard Tower');
    expect(wt?.ef).toBeNull();
    expect(buildingBase(B('Castle')).barm).toBe(8); // .dat 城堡对「所有建筑」类别(11) 护甲 8
  });

  it('全站 56 文明 × 38 建筑科技列表零重复 t.id（含 4 国城堡独科去重，#1407）', () => {
    expect(civs).toHaveLength(56);
    expect(bs).toHaveLength(38);
    for (const c of civs) {
      for (const b of bs) {
        const list = buildingSimTechs(ctx, b, c.en);
        const idsList = list.map((x) => x.t.id);
        expect(new Set(idsList).size, `${c.en}/${b.id}`).toBe(idsList.length);
        const merged = mergeSimCostTechs(list, applicableSimCostTechs(ctx, b, c.en));
        const mergedIds = merged.map((x) => x.t.id);
        expect(new Set(mergedIds).size, `merged ${c.en}/${b.id}`).toBe(mergedIds.length);
      }
    }

    const castle = B('Castle');
    const castleCases: [string, number, number][] = [
      ['Persians', 7, 488], // 7 堡垒(Citadels, 有数值效果) + 488 波斯步弓手(Kamandaran, 仅文本)
      ['Celts', 482, 5], // 482 堡垒(Stronghold) + 5 凯尔特狂暴(Furor Celtica)
      ['Georgians', 923, 924], // 923 斯万箭塔(Svan Towers) + 924 阿兹瑙里骑兵(Aznauri Cavalry)
      ['Teutons', 11, 489], // 11 开垛口(Crenellations) + 489 重装甲(Ironclad)
    ];
    for (const [civ, numericUtId, textUtId] of castleCases) {
      const av = buildingSimTechs(ctx, castle, civ);
      const numericMatches = av.filter((x) => x.t.id === numericUtId);
      expect(numericMatches, `${civ} Castle UT ${numericUtId}`).toHaveLength(1);
      expect(numericMatches[0]!.ef).not.toBeNull();
      const textMatches = av.filter((x) => x.t.id === textUtId);
      expect(textMatches, `${civ} Castle text UT ${textUtId}`).toHaveLength(1);
      expect(textMatches[0]!.ef).toBeNull();
    }
  });

  it('马来巨港（1189）补齐 IMPLIED 激活 669/670/671 恢复 atk=8, rng=10, los=21，船坞（45）不受影响（#1407）', () => {
    const harbor = B('Harbor');
    const availIds = buildingSimTechs(ctx, harbor, 'Malay')
      .filter((x) => x.ef)
      .map((x) => x.t.id)
      .sort((a, b) => a - b);
    expect(availIds).toEqual([8, 47, 50, 54, 199, 200, 201, 280, 322, 380]);

    const matchedHarbor = matchingGenericFx(harbor, true, 4, (n) => ['Fletching', 'Bodkin Arrow', 'Bracer'].includes(n), 'Malay');
    expect(matchedHarbor.map((g) => g.tech).sort((a, b) => a - b)).toEqual([669, 670, 671]);

    // 未选箭术科技时保持基础属性
    const emptyHarbor = simulateBuilding(ctx, harbor, 'Malay', 4, new Set());
    expect([emptyHarbor.atk, emptyHarbor.rng, emptyHarbor.los]).toEqual([3, 7, 10]);

    // 城堡时代：箭羽 + 锥子箭触发 669/670
    const castleHarbor = simulateBuilding(ctx, harbor, 'Malay', 3, ids('Fletching', 'Bodkin Arrow'));
    expect([castleHarbor.atk, castleHarbor.rng, castleHarbor.los]).toEqual([6, 9, 12]);

    // 帝王满科技：atk=8, rng=10, los=21, minr=0, 对船 +4
    const fullHarbor = full('Harbor', 'Malay');
    expect([fullHarbor.atk, fullHarbor.rng, fullHarbor.los, fullHarbor.minr]).toEqual([8, 10, 21, 0]);
    expect(fullHarbor.bonus['船只']).toBe(4);

    // 反例：普通船坞（45）绝不进入 IMPLIED，不误触发海上霸主组合科技 669/670/671（基础 los=8，仅加城镇瞭望/巡逻 +8 = 16）
    const dock = B('Dock');
    expect(matchingGenericFx(dock, true, 4, (n) => ['Fletching', 'Bodkin Arrow', 'Bracer'].includes(n), 'Malay')).toEqual([]);
    const fullDock = full('Dock', 'Malay');
    expect([fullDock.atk, fullDock.rng, fullDock.los]).toEqual([7, 6, 16]);
  });

  it('全站 19 座无攻建筑过滤 322/380 等纯进攻科技，强制保留西西里城楼（1665）全部进攻科技（#1407）', () => {
    const offensiveStats = new Set<Effect['s']>(['atk', 'rng', 'minr', 'rof', 'bonus', 'acc', 'ca']);
    const expectedNoAtkWithOldLeak = [12, 49, 68, 70, 84, 87, 101, 103, 104, 209, 276, 562, 584, 598, 1021, 1734, 1754, 1808, 2556];
    const noAtkBuildings = bs.filter((b) => b.atk === 0 && (b.atks?.length ?? 0) === 0);
    const noAtkIds = new Set(noAtkBuildings.map((b) => b.id));
    for (const id of expectedNoAtkWithOldLeak) expect(noAtkIds.has(id), `no-atk id ${id}`).toBe(true);
    expect(noAtkIds.has(1665)).toBe(false);

    for (const b of noAtkBuildings) {
      for (const civ of b.civs) {
        const av = buildingSimTechs(ctx, b, civ);
        const tids = av.map((x) => x.t.id);
        expect(tids, `${civ}/${b.id} Murder Holes`).not.toContain(322);
        expect(tids, `${civ}/${b.id} Heated Shot`).not.toContain(380);
        for (const row of av) {
          for (const fx of row.ef ?? []) {
            expect(offensiveStats.has(fx.s), `${civ}/${b.id}/t:${row.t.id} offensive stat ${fx.s}`).toBe(false);
          }
        }
      }
    }

    // 商队旅馆（1754）：波斯/印度斯坦保留非进攻科技，即使手动传 322/380 也不生效
    const caravanserai = B('Caravanserai');
    expect(
      buildingSimTechs(ctx, caravanserai, 'Persians')
        .map((x) => x.t.id)
        .sort((a, b) => a - b),
    ).toEqual([8, 50, 51, 280]);
    expect(
      buildingSimTechs(ctx, caravanserai, 'Hindustanis')
        .map((x) => x.t.id)
        .sort((a, b) => a - b),
    ).toEqual([8, 50, 280]);
    const staleSel = simulateBuilding(ctx, caravanserai, 'Persians', 4, new Set([322, 380]));
    expect(staleSel.bonus['船只']).toBeUndefined();
    expect(staleSel.minr).toBe(0);

    // 非进攻科技与线路升级不受影响（如骡车保留手推车/独轮推车，石墙保留垛墙文本项）
    expect(buildingSimTechs(ctx, B('Mule Cart'), 'Armenians').map((x) => x.t.id)).toEqual(expect.arrayContaining([213, 249]));
    expect(buildingSimTechs(ctx, B('Stone Wall'), 'Franks').some((x) => x.t.en === 'Fortified Wall' && x.ef === null)).toBe(true);

    // 强制反例：西西里城楼（1665）基础 atk=0 但具备 5 项攻击类别，必须完整保留进攻科技与满科技数值
    const donjon = B('Donjon');
    expect(donjon.atk).toBe(0);
    expect(donjon.atks).toHaveLength(5);
    const donjonIds = buildingSimTechs(ctx, donjon, 'Sicilians')
      .map((x) => x.t.id)
      .sort((a, b) => a - b);
    expect(donjonIds).toEqual(expect.arrayContaining([47, 199, 200, 201, 322, 380, 608]));
    const fullDonjon = full('Donjon', 'Sicilians');
    expect([fullDonjon.atk, fullDonjon.rng, fullDonjon.minr, fullDonjon.los]).toEqual([5, 3, 0, 21]);

    // 合成边界：仅凭 atks 非空即可判定具备攻击能力；四项为 0 且 atks 为空则过滤进攻文本项（如 Ballistics）
    const atksOnlyDonjon: Building = { ...donjon, atk: 0, rng: 0, minr: 0, rof: 0 };
    expect(buildingSimTechs(ctx, atksOnlyDonjon, 'Sicilians').map((x) => x.t.id)).toEqual(expect.arrayContaining([322, 380, 608]));
    const noAtkSyntheticTower: Building = { ...B('Watch Tower'), atk: 0, rng: 0, minr: 0, rof: 0, atks: [] };
    expect(buildingSimTechs(ctx, noAtkSyntheticTower, 'Britons').some((x) => x.t.en === 'Ballistics' || x.t.en === 'Heated Shot')).toBe(false);
  });
});
