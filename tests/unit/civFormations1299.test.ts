import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { discountedCost } from '../../src/domain/costDiscount';
import { DAT } from '../../src/domain/datEffects';
import { calculateGeneralGarrison, readGeneralGarrison } from '../../src/domain/garrisonGeneral';
import { calculateSiege, decodeSiege } from '../../src/domain/siege';
import { unitCost } from '../../src/domain/unitCost';
import { FormationText } from '../../src/features/civs/components/CivFormations';

const rightArrow = String.fromCodePoint(0x2192);
const byCiv = (civ: string) => civFormationContent.find((entry) => entry.civ === civ)!;
const route = (civ: string, id: string) => byCiv(civ).routes.find((entry) => entry.id === id)!;

const parseGarrisonHref = (href: string) => {
  const url = new URL(href);
  const [path, query = ''] = url.hash.split('?');
  const match = /^#\/building\/(\d+)$/.exec(path ?? '');
  if (!match) throw new Error(`Invalid garrison URL: ${href}`);
  return { buildingId: Number(match[1]), params: new URLSearchParams(query) };
};

describe('#1299 九文明驻军满科技与工具数据核实', () => {
  it('波希米亚、保加利亚、西西里、日本、格鲁吉亚的驻军预览链接与领域计算严格一致', async () => {
    const ctx = { core: await loadCore(), trees: await loadTrees() };
    const cases = [
      {
        civ: 'Bohemians',
        routeId: 'bohemians-handcannon-halberdier',
        label: '无射箭槽 · 5 个火枪手 5/5 箭',
        total: 5,
        max: 5,
        buildingPower: 6,
        powerEach: 17 / 3.45,
      },
      {
        civ: 'Bohemians',
        routeId: 'bohemians-handcannon-halberdier',
        label: '含射箭槽 · 5 个火枪手 4/5 箭',
        total: 4,
        max: 5,
        buildingPower: 7.5,
        powerEach: 17 / 3.45,
      },
      {
        civ: 'Bulgarians',
        routeId: 'bulgarians-krepost-konnik',
        label: '帝王满科技 · 20 个村民驻营垒 17/21 箭',
        total: 17,
        max: 21,
        buildingPower: 7,
        powerEach: 4.5,
      },
      {
        civ: 'Sicilians',
        routeId: 'sicilians-serjeant-light-cavalry',
        label: '无射箭槽 · 9 个村民 12/12 箭',
        total: 12,
        max: 12,
        buildingPower: 4.5,
        powerEach: 4.5,
      },
      {
        civ: 'Sicilians',
        routeId: 'sicilians-serjeant-light-cavalry',
        label: '含射箭槽 · 10 个村民 10/12 箭',
        total: 10,
        max: 12,
        buildingPower: 6,
        powerEach: 4.5,
      },
      {
        civ: 'Sicilians',
        routeId: 'sicilians-serjeant-light-cavalry',
        label: '含射箭槽 · 10 个劲弩手 11/12 箭',
        total: 11,
        max: 12,
        buildingPower: 6,
        powerEach: 5,
      },
      {
        civ: 'Sicilians',
        routeId: 'sicilians-serjeant-light-cavalry',
        label: '10 个精锐萨金特卫兵 3/12 箭（不增箭）',
        total: 3,
        max: 12,
        buildingPower: 4.5,
        powerEach: 0,
      },
      {
        civ: 'Japanese',
        routeId: 'japanese-samurai-light-cavalry',
        label: '含射箭槽 · 5 个村民 6/7 箭',
        total: 6,
        max: 7,
        buildingPower: 7.5,
        powerEach: 4.5,
      },
      {
        civ: 'Japanese',
        routeId: 'japanese-samurai-light-cavalry',
        label: '含射箭槽 · 5 个劲弩手 6/7 箭',
        total: 6,
        max: 7,
        buildingPower: 7.5,
        powerEach: 10 / 1.7,
      },
      {
        civ: 'Georgians',
        routeId: 'monaspa-towers',
        label: '斯万箭塔含射箭槽 · 5 个村民 4/5 箭',
        total: 4,
        max: 5,
        buildingPower: 8.5,
        powerEach: 5.5,
      },
      {
        civ: 'Georgians',
        routeId: 'monaspa-towers',
        label: '斯万箭塔含射箭槽 · 5 个弩手 3/5 箭',
        total: 3,
        max: 5,
        buildingPower: 8.5,
        powerEach: 4.5,
      },
      {
        civ: 'Georgians',
        routeId: 'monaspa-towers',
        label: '斯万箭塔含射箭槽 · 5 个精锐掷矛手 2/5 箭',
        total: 2,
        max: 5,
        buildingPower: 8.5,
        powerEach: 7 / 3,
      },
    ] as const;

    for (const item of cases) {
      const link = route(item.civ, item.routeId).evidence.links?.find(({ label }) => label === item.label);
      expect(link, `${item.civ} missing link ${item.label}`).toBeDefined();
      const { buildingId, params } = parseGarrisonHref(link!.href);
      const building = ctx.core.buildingById[buildingId]!;
      const parsed = readGeneralGarrison(params, building);
      expect(parsed.errors, item.label).toEqual([]);
      const result = calculateGeneralGarrison(ctx, building, parsed.config);
      expect(result.errors, item.label).toEqual([]);
      expect(result.warnings, item.label).toEqual([]);
      expect(result.totalProjectiles, item.label).toBe(item.total);
      expect(result.maxProjectiles, item.label).toBe(item.max);
      expect(result.buildingPower, item.label).toBeCloseTo(item.buildingPower, 4);
      expect(result.rows[0]?.powerEach, item.label).toBeCloseTo(item.powerEach, 4);
    }

    // 保加利亚 18/19 村民阈值核对
    const krepost = ctx.core.buildingById[1251]!;
    const bul18 = calculateGeneralGarrison(ctx, krepost, {
      civ: 'Bulgarians',
      age: 4,
      techs: [199, 200, 201, 47],
      rows: [{ unitId: 83, count: '18', entry: 'enter' }],
    });
    const bul19 = calculateGeneralGarrison(ctx, krepost, {
      civ: 'Bulgarians',
      age: 4,
      techs: [199, 200, 201, 47],
      rows: [{ unitId: 83, count: '19', entry: 'enter' }],
    });
    expect([bul18.totalProjectiles, bul19.totalProjectiles]).toEqual([16, 17]);

    // 西西里城楼产精锐萨金特卫兵（1661）同样不增箭
    const donjon = ctx.core.buildingById[1665]!;
    const donjonSerjeant = calculateGeneralGarrison(ctx, donjon, {
      civ: 'Sicilians',
      age: 4,
      techs: [199, 200, 201, 47],
      rows: [{ unitId: 1661, count: '10', entry: 'enter' }],
    });
    expect([donjonSerjeant.errors, donjonSerjeant.totalProjectiles, donjonSerjeant.rows[0]?.powerEach]).toEqual([[], 3, 0]);

    // 日本无射箭槽对照：5 劲弩 7/7、5 村民 6/7
    const keep = ctx.core.buildingById[235]!;
    const jpNoSlitsArb = calculateGeneralGarrison(ctx, keep, {
      civ: 'Japanese',
      age: 4,
      techs: [199, 200, 201, 47, 437, 484],
      rows: [{ unitId: 492, count: '5', entry: 'enter' }],
    });
    const jpNoSlitsVil = calculateGeneralGarrison(ctx, keep, {
      civ: 'Japanese',
      age: 4,
      techs: [199, 200, 201, 47, 437, 484],
      rows: [{ unitId: 83, count: '5', entry: 'enter' }],
    });
    expect([jpNoSlitsArb.totalProjectiles, jpNoSlitsVil.totalProjectiles]).toEqual([7, 6]);

    // 格鲁吉亚无射箭槽对照：5 村民 4/5、5 弩手 4/5、5 精锐掷矛 2/5
    const geoNoSlits = [83, 24, 6].map(
      (unitId) =>
        calculateGeneralGarrison(ctx, keep, {
          civ: 'Georgians',
          age: 4,
          techs: [199, 200, 201, 47, 923],
          rows: [{ unitId, count: '5', entry: 'enter' }],
        }).totalProjectiles,
    );
    expect(geoNoSlits).toEqual([4, 4, 2]);
  });

  it('土耳其手推炮攻城链接与 siege.ts 实算一致，未核验建筑与护甲科技保持未核验边界', async () => {
    const core = await loadCore();
    const turks = route('Turks', 'turks-hussar-handcannon');
    const siegeLinks = turks.evidence.links?.filter(({ href }) => href.includes('#/siege?')) ?? [];
    expect(siegeLinks).toHaveLength(2);

    const parsed = siegeLinks.map(({ label, href }) => {
      const query = new URL(href).hash.split('?')[1] ?? '';
      const cfg = decodeSiege(query, core);
      const u = core.unitById[cfg.unit]!;
      const b = core.buildingById[cfg.bldg]!;
      return { label, cfg, res: calculateSiege(u, b, cfg.n, cfg.civ, cfg.armor) };
    });

    expect(parsed[0]).toMatchObject({
      label: '2 个手推炮 · 无甲城堡 11 次 / 65 秒',
      cfg: { unit: 36, n: 2, bldg: 82, civ: 'Turks', armor: [] },
      res: { verified: true, damage: 224, hits: 11, gameSeconds: 65 },
    });
    expect(parsed[1]).toMatchObject({
      label: '1 个手推炮 · 无甲大型箭塔 9 次 / 52 秒',
      cfg: { unit: 36, n: 1, bldg: 235, civ: 'Turks', armor: [] },
      res: { verified: true, damage: 277, hits: 9, gameSeconds: 52 },
    });

    const bc = core.unitById[36]!;
    const castle = core.buildingById[82]!;
    const keep = core.buildingById[235]!;
    expect(calculateSiege(bc, castle, 1, 'Turks', [])).toMatchObject({ verified: true, damage: 224, hits: 22, gameSeconds: 136.5 });
    expect(calculateSiege(bc, keep, 2, 'Turks', [])).toMatchObject({ verified: true, damage: 277, hits: 5, gameSeconds: 26 });

    // Issue 1489 扩展手推炮至 25 国、9 座核心建筑与石工/建筑学后，仍对未收录建筑、墙门护甲科技与不可训练文明保持未核验边界
    const stoneWall = core.buildingById[117]!;
    for (const unverifiedId of [12, 70, 1251, 276]) {
      expect(calculateSiege(bc, core.buildingById[unverifiedId]!, 1, 'Turks', []).verified, `bldg ${unverifiedId}`).toBe(false);
    }
    expect(calculateSiege(bc, stoneWall, 1, 'Turks', [50]).verified).toBe(false);
    expect(calculateSiege(bc, stoneWall, 1, 'Turks', [51]).verified).toBe(false);
    expect(calculateSiege(bc, castle, 1, 'Britons', []).verified).toBe(false);
  });

  it('法兰克折扣、图皮载具容量与吴卧虎固定数据口径全部可从仓库数据复现', async () => {
    const core = await loadCore();

    // 法兰克：王家敕令骑兵（1496）与城堡折扣（82）
    const ordonnance = core.techById[1496]!;
    for (const unitId of [2700, 2701]) {
      const res = unitCost(core.unitById[unitId]!, 'Franks', 4, [ordonnance]);
      expect(res.undecoded).toEqual([]);
      expect(res.cost).toEqual({ Gold: 39, Wood: 40 });
    }
    const castle = core.buildingById[82]!;
    expect(discountedCost(castle, 'Franks', 3).cost).toEqual({ Stone: 552.5, Wood: 0 });
    expect(discountedCost(castle, 'Franks', 4).cost).toEqual({ Stone: 487.5, Wood: 0 });

    const franksCrossbowLinks = route('Franks', 'franks-heavy-mounted-crossbow-light-cav').evidence.links ?? [];
    expect(franksCrossbowLinks.filter(({ href }) => href.endsWith('/data/game/effects.json'))).toHaveLength(1);
    expect(franksCrossbowLinks.some(({ href }) => href === 'https://linhongcun.github.io/aoe2-analyzer/#/tech/1496?civ=Franks')).toBe(true);
    expect(route('Franks', 'franks-paladin-skirmisher').evidence.links?.some(({ href }) => href.endsWith('/data/game/effects.json'))).toBe(true);

    // 图皮：units.json garrisonCapacity
    expect([core.unitById[548]?.garrisonCapacity, core.unitById[1105]?.garrisonCapacity, core.unitById[545]?.garrisonCapacity]).toEqual([6, 10, 20]);
    for (const routeId of ['tupi-champi-slinger', 'tupi-blackwood-halberdier']) {
      expect(route('Tupi', routeId).evidence.links?.some(({ href }) => href.endsWith('/data/game/units.json'))).toBe(true);
    }

    // 吴：effects.json Sitting Tiger (1081)
    const sittingTiger = DAT.techs['Sitting Tiger'];
    expect(sittingTiger).toBeDefined();
    expect(sittingTiger!.id).toBe(1081);
    expect(sittingTiger!.rules).toEqual([]);
    expect(sittingTiger!.eco.some((e) => e.a === 102 && e.op === 'add' && e.v === 2 && e.t?.includes(1942))).toBe(true);
    expect(sittingTiger!.eco.some((e) => e.a === 107 && e.op === 'add' && e.v === 2 && e.t?.includes(1942))).toBe(true);
    expect(sittingTiger!.eco.some((e) => e.a === 102 && e.op === 'add' && e.v === 2 && e.t?.includes(1948))).toBe(true);
    expect(route('Wu', 'wu-ranged-by-opponent').evidence.links?.some(({ href }) => href.endsWith('/data/game/effects.json'))).toBe(true);
  });

  it('全站路线 evidence.links 唯一，且本次新增/修订文本与链接标签均由 FormationText 完整包裹不换行', () => {
    for (const civ of civFormationContent) {
      for (const r of civ.routes) {
        const hrefs = (r.evidence.links ?? []).map(({ href }) => href);
        expect(new Set(hrefs).size, `${civ.civ}/${r.id} duplicate evidence.links`).toBe(hrefs.length);
      }
    }

    const expectedWraps: [string, string[]][] = [
      [
        route('Bohemians', 'bohemians-handcannon-halberdier').adjustments!.find(({ id }) => id.endsWith('-garrison-tower'))!.text,
        ['5 个火枪手', '5/5 箭', '4/5 箭'],
      ],
      [route('Bulgarians', 'bulgarians-krepost-konnik').limitation!, ['20 个村民', '17/21 箭', '19 个村民']],
      [
        route('Sicilians', 'sicilians-serjeant-light-cavalry')
          .supplements.find(({ mode }) => mode === 'position-variant')!
          .entities.find(({ id }) => id === 1665)!.role,
        ['3/12 箭', '9 个村民', '12/12 箭', '10 个村民', '10/12 箭', '10 个劲弩手', '11/12 箭', '10 个精锐萨金特卫兵'],
      ],
      [
        route('Japanese', 'japanese-samurai-light-cavalry').adjustments!.find(({ id }) => id.endsWith('-ninth'))!.text,
        [`1${rightArrow}3`, '5 个村民', '5 个劲弩手', '6/7 箭', '7/7 箭'],
      ],
      [route('Georgians', 'monaspa-towers').alternatives!, ['5 个村民', '4/5 箭', '5 个弩手', '3/5 箭', '5 个精锐掷矛手', '2/5 箭']],
      [route('Turks', 'turks-hussar-handcannon').limitation!, ['2 个手推炮', '11 次 / 65 秒', '1 个手推炮', '9 次 / 52 秒']],
      [route('Franks', 'franks-paladin-skirmisher').alternatives!, ['552.5 石料', '487.5 石料', '650 石料']],
      [route('Franks', 'franks-heavy-mounted-crossbow-light-cav').reason!, ['65 黄金', '40 木材', '39 黄金', '80 食物']],
      [
        route('Wu', 'wu-ranged-by-opponent')
          .supplements.flatMap(({ entities }) => entities)
          .find(({ id }) => id === 1942)!.research!.caveat!,
        ['+2'],
      ],
    ];

    for (const [text, tokens] of expectedWraps) {
      const html = renderToStaticMarkup(createElement(FormationText, { text }));
      for (const token of tokens) {
        expect(html, `${text} -> ${token}`).toContain(`<span class="num nw">${token}</span>`);
      }
      // 确保计数词组没有把单位拆出 .num.nw 之外
      expect(html, `split counted noun in ${text}`).not.toMatch(
        /<span class="num nw">\d+\s*个<\/span>(?:火枪手|村民|劲弩手|精锐萨金特卫兵|弩手|精锐掷矛手|手推炮)/,
      );
    }

    const updatedCivs = ['Bohemians', 'Bulgarians', 'Sicilians', 'Japanese', 'Georgians', 'Turks', 'Franks', 'Tupi', 'Wu'];
    for (const civName of updatedCivs) {
      for (const r of byCiv(civName).routes) {
        for (const { label } of r.evidence.links ?? []) {
          const html = renderToStaticMarkup(createElement(FormationText, { text: label }));
          expect(html, `split counted noun in label ${label}`).not.toMatch(
            /<span class="num nw">\d+\s*个<\/span>(?:火枪手|村民|劲弩手|精锐萨金特卫兵|弩手|精锐掷矛手|手推炮)/,
          );
        }
      }
    }
  });
});
