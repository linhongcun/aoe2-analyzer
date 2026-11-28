import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CORE } from '../../src/data/core';
import { civByEn, civs, loadCore, loadTrees } from '../../src/data';
import { ARMC_CLASS_NOTE, MOUNTED_REDUCTION_CLASS } from '../../src/domain/affects';
import { civBonuses } from '../../src/domain/civBonus';
import { damagePerHit, fighterFrom } from '../../src/domain/duel';
import { MANUAL_CIV_BONUSES, MANUAL_TEAM_BONUSES } from '../../src/domain/effects.manual';
import { calculateSiege } from '../../src/domain/siege';
import { simulate } from '../../src/domain/simulator';
import BonusDetail from '../../src/features/bonuses/components/BonusDetail';
import CivDetail from '../../src/features/civs/components/CivDetail';
import Compare from '../../src/features/compare/components/Compare';
import TechDetail from '../../src/features/techs/components/TechDetail';
import { filterTechList, techQueryMatches, type TechListFilters } from '../../src/features/techs/components/techQuery';
import { BonusBodyContent, BonusText } from '../../src/shared/ui/BonusBody';
import { ProductionTransferBanner } from '../../src/shared/ui/ProductionTransferBanner';
import SimPanel, { ArmorClasses, BonusTable } from '../../src/shared/ui/sim/SimPanel';
import { Linked, NumWrappedText } from '../../src/shared/ui/widgets';
import { ctx, unit, units } from './helpers';

const plainText = (html: string) => html.replace(/<[^>]*>/g, '');
const EmptyTree = () => null;
const emptyTechFilters = (query: string): TechListFilters => ({ query, type: '', age: '', building: '', release: '' });

beforeAll(async () => {
  await loadCore();
  await loadTrees();
});

describe('#1445 数据与文案对齐回归', () => {
  it('effects.manual.ts 修复高丽团队加成仅匹配村民 83 且萨拉森回退为 +3', () => {
    const korean = MANUAL_TEAM_BONUSES.find((row) => row[0] === 'Koreans');
    expect(korean).toBeDefined();
    const matchedIds = units.filter((u) => korean![2](u)).map((u) => u.id);
    expect(matchedIds).toEqual([83]);
    expect(korean![3]).toEqual([{ s: 'los', v: 3 }]);

    const saracen = MANUAL_TEAM_BONUSES.find((row) => row[0] === 'Saracens');
    expect(saracen).toBeDefined();
    expect(saracen![1]).toBe('萨拉森：步弓手和散兵对建筑攻击 +3');
    expect(saracen![3]).toEqual([{ s: 'bonus', vs: '标准建筑', v: 3 }]);
  });

  it('siege.ts 在类 39 改名后保持装甲战象 1744 与攻城战象 1746 拆城堡结果不变', () => {
    const castle = CORE.buildingById[82]!;
    const armored = CORE.unitById[1744]!;
    const siege = CORE.unitById[1746]!;
    expect(armored.atks).toContainEqual([MOUNTED_REDUCTION_CLASS, -3]);
    expect(siege.atks).toContainEqual([MOUNTED_REDUCTION_CLASS, -3]);

    for (const civ of ['Bengalis', 'Dravidians', 'Hindustanis'] as const) {
      expect(calculateSiege(armored, castle, 4, civ, [])).toMatchObject({ verified: true, hits: 15, gameSeconds: 42 });
      expect(calculateSiege(siege, castle, 4, civ, [])).toMatchObject({ verified: true, hits: 13, gameSeconds: 36 });
    }
    expect(calculateSiege(armored, castle, 4, 'Gurjaras', [])).toMatchObject({ verified: true, hits: 11, gameSeconds: 30 });
    expect(calculateSiege(siege, castle, 4, 'Gurjaras', [])).toMatchObject({ verified: true, hits: 9, gameSeconds: 24 });
  });

  it('duel.ts 龙脉减伤数值零变化：法兰克游侠打精锐弯刀 15 降至 12、打重装骆驼兵 16 降至 13，村民不受影响', () => {
    const franksPaladin = fighterFrom(unit('Paladin'), simulate(ctx, unit('Paladin'), 'Franks', 4, new Set([67, 68, 75]), new Set()));
    const ethFullTechs = new Set([67, 68, 75, 74, 76, 77, 81, 82, 80, 39]);
    const shotelOff = fighterFrom(unit('Elite Shotel Warrior'), simulate(ctx, unit('Elite Shotel Warrior'), 'Ethiopians', 4, ethFullTechs, new Set()));
    const shotelOn = fighterFrom(
      unit('Elite Shotel Warrior'),
      simulate(ctx, unit('Elite Shotel Warrior'), 'Ethiopians', 4, new Set([...ethFullTechs, 574]), new Set()),
    );
    expect(damagePerHit(franksPaladin, shotelOff)).toBe(15);
    expect(damagePerHit(franksPaladin, shotelOn)).toBe(12);

    const camelOff = fighterFrom(unit('Heavy Camel Rider'), simulate(ctx, unit('Heavy Camel Rider'), 'Ethiopians', 4, ethFullTechs, new Set()));
    const camelOn = fighterFrom(
      unit('Heavy Camel Rider'),
      simulate(ctx, unit('Heavy Camel Rider'), 'Ethiopians', 4, new Set([...ethFullTechs, 574]), new Set()),
    );
    expect(damagePerHit(franksPaladin, camelOff)).toBe(16);
    expect(damagePerHit(franksPaladin, camelOn)).toBe(13);

    const vilOff = fighterFrom(unit('Villager'), simulate(ctx, unit('Villager'), 'Ethiopians', 4, new Set(), new Set()));
    const vilOn = fighterFrom(unit('Villager'), simulate(ctx, unit('Villager'), 'Ethiopians', 4, new Set([574]), new Set()));
    expect(damagePerHit(franksPaladin, vilOff)).toBe(damagePerHit(franksPaladin, vilOn));
  });

  it('NumWrappedText 与 Linked(wrapNums) 保留全文并把数值与常见单位包进 .num.nw', () => {
    const samples = [
      ARMC_CLASS_NOTE,
      '步弓手和掷矛手对建筑的攻击力 +3',
      '骑乘单位在封建/城堡/帝王时代每分钟恢复 2/8/14 生命值',
      '骑乘单位在封建/城堡/帝王时代造成的额外伤害 +20/30/40%',
      '步兵和骑乘单位在城堡/帝王时代的近战护甲 +1/+2',
    ];
    for (const sample of samples) {
      const html = renderToStaticMarkup(createElement(NumWrappedText, { text: sample }));
      expect(plainText(html)).toBe(sample);
    }
    expect(renderToStaticMarkup(createElement(NumWrappedText, { text: '步弓手和掷矛手对建筑的攻击力 +3' }))).toContain('<span class="num nw">+3</span>');
    expect(renderToStaticMarkup(createElement(NumWrappedText, { text: '骑乘单位在封建/城堡/帝王时代每分钟恢复 2/8/14 生命值' }))).toContain(
      '<span class="num nw">2/8/14 生命值</span>',
    );
    expect(renderToStaticMarkup(createElement(NumWrappedText, { text: '步兵和骑乘单位在城堡/帝王时代的近战护甲 +1/+2' }))).toContain(
      '<span class="num nw">+1/+2</span>',
    );

    const linkedDefault = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Linked, { text: '步弓手和掷矛手对建筑的攻击力 +3' })));
    expect(linkedDefault).not.toContain('class="num nw"');
    const linkedWrapped = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(Linked, { text: '步弓手和掷矛手对建筑的攻击力 +3', wrapNums: true })),
    );
    expect(linkedWrapped).toContain('<span class="num nw">+3</span>');
    expect(plainText(linkedWrapped)).toBe('步弓手和掷矛手对建筑的攻击力 +3');
  });

  it('BonusTable、ArmorClasses、SimPanel、BonusText 与 ProductionTransferBanner 均输出预期防折行标记', () => {
    const tableHtml = renderToStaticMarkup(
      createElement(BonusTable, {
        B: { [MOUNTED_REDUCTION_CLASS]: -3 },
        S: { [MOUNTED_REDUCTION_CLASS]: -3 },
        C: { [MOUNTED_REDUCTION_CLASS]: -3 },
        cmpLabel: '对比',
      }),
    );
    expect(tableHtml).toContain('<b class="num nw">-3</b>');
    expect(tableHtml).toContain('<td class="num nw">-3</td>');

    const armorHtml = renderToStaticMarkup(createElement(ArmorClasses, { list: [[MOUNTED_REDUCTION_CLASS, -3]] }));
    expect(armorHtml).toContain('class="tag nw"');
    expect(armorHtml).toContain('data-t="royal-heirs-armc"');

    const archer = unit('Archer');
    const base = simulate(ctx, archer, 'Britons', 4, new Set(), new Set());
    const simHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(SimPanel, {
          civs: ['Britons'],
          minAge: 2,
          civ: 'Britons',
          age: 4,
          sel: new Set<number>(),
          team: new Set<number>(),
          cmp: '',
          avail: [],
          techById: CORE.techById,
          rows: [],
          base,
          cur: base,
          cmpStats: null,
          civNotes: ['骑乘单位从封建时代开始生命值 +20%'],
          teamBonuses: [{ label: '萨拉森：步弓手和掷矛手对建筑的攻击力 +3', ok: true }],
          go: () => {},
          setCmp: () => {},
        }),
      ),
    );
    expect(simHtml).toContain('已计入文明加成：骑乘单位从封建时代开始生命值 <span class="num nw">+20%</span>');
    expect(simHtml).toContain('<span>萨拉森：步弓手和掷矛手对建筑的攻击力 <span class="num nw">+3</span></span>');

    const saracenTeam = civBonuses(civByEn('Saracens')!).find((b) => b.team)!;
    const bonusTextHtml = renderToStaticMarkup(createElement(BonusText, { b: saracenTeam, linked: false }));
    expect(bonusTextHtml).toContain('<span class="num nw">+3</span>');
    expect(plainText(bonusTextHtml)).toBe('步弓手和掷矛手对建筑的攻击力 +3');

    const bonusDetailHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/civ/Saracens/bonus/team'] },
        createElement(Routes, null, createElement(Route, { path: '/civ/:en/bonus/:idx', element: createElement(BonusDetail) })),
      ),
    );
    expect(bonusDetailHtml).toContain('<small>Foot Archers and Skirmishers <span class="num nw">+3</span> attack vs. buildings</small>');

    const georgiansMounted = civBonuses(civByEn('Georgians')!).find((b) => b.idx === 2)!;
    for (const [bonus, expectedEnFragment] of [
      [saracenTeam, 'Foot Archers and Skirmishers <span class="num nw">+3</span> attack vs. buildings'],
      [georgiansMounted, 'Mounted Units regenerate <span class="num nw">2/8/14 HP</span> per minute in Feudal/Castle/Imperial Age'],
    ] as const) {
      const evidenceHtml = renderToStaticMarkup(
        createElement(MemoryRouter, null, createElement(BonusBodyContent, { b: bonus, core: CORE, head: false, variant: 'evidence' })),
      );
      expect(evidenceHtml).toContain(expectedEnFragment);
      const headHtml = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(BonusBodyContent, { b: bonus, core: CORE, head: true })));
      expect(headHtml).toContain(expectedEnFragment);
    }

    const bannerHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        {
          initialEntries: [
            {
              pathname: '/production',
              search: '?mode=train-total',
              state: {
                productionTransfer: {
                  source: 'mixed-duel',
                  search: '?mode=train-total',
                  side: 'a',
                  civ: 'Britons',
                  age: 4,
                  count: 1,
                  pricing: [],
                  unlocks: [],
                  omitted: ['团队效果（萨拉森：步弓手和掷矛手对建筑的攻击力 +3）'],
                },
              },
            },
          ],
        },
        createElement(ProductionTransferBanner),
      ),
    );
    expect(bannerHtml).toContain('<span class="num nw">+3</span>');
  });

  it('#1493 全库 5 项 Mounted Units 科技、3 国独特科技简述与法兰克回退文案统一为「骑乘单位」', () => {
    expect(MANUAL_CIV_BONUSES.Franks?.[0]?.[2]).toBe('骑乘单位从封建时代起生命值 +20%');

    const expectedTechs: [number, string][] = [
      [39, '骑乘单位的移动速度 +10%。'],
      [435, '骑乘单位的生命值 +20。'],
      [574, '弯刀勇士和骆驼骑兵受到骑乘单位的伤害 -3。'],
      [924, '骑乘单位所占人口空间 -20%。'],
      [1062, '骑乘单位近战护甲 +4。'],
    ];
    for (const [id, desc] of expectedTechs) {
      const tech = CORE.techById[id]!;
      expect(tech.desc).toBe(desc);
      expect(techQueryMatches(tech, '骑乘单位')).toBe(true);
      expect(techQueryMatches(tech, '骑兵单位')).toBe(false);
      expect(techQueryMatches(tech, '骑马单位')).toBe(false);
    }

    const matchedIds = filterTechList(CORE.techs, emptyTechFilters('骑乘单位'))
      .map((t) => t.id)
      .sort((a, b) => a - b);
    expect(matchedIds).toEqual([39, 435, 574, 924, 1062]);
    expect(filterTechList(CORE.techs, emptyTechFilters('骑兵单位'))).toEqual([]);
    expect(filterTechList(CORE.techs, emptyTechFilters('骑马单位'))).toEqual([]);

    expect(civByEn('Ethiopians')!.ct).toBe('龙脉 (弯刀勇士和骆驼骑兵受到骑乘单位的伤害 -3)｜Royal Heirs');
    expect(civByEn('Georgians')!.it).toBe('阿兹瑙里骑兵 (骑乘单位所占人口空间 -20%)｜Aznauri Cavalry');
    expect(civByEn('Wei')!.it).toBe('明光铠 (骑乘单位近战护甲 +4)｜Ming Guang Armor');
    for (const c of civs) {
      for (const text of [c.ct, c.it, c.tb, ...c.bon]) {
        expect(text).not.toContain('骑兵单位');
        expect(text).not.toContain('骑马单位');
      }
    }

    // 消费端 SSR 核验：TechDetail、CivDetail、Compare
    vi.stubGlobal('window', { history: { state: null }, location: { hash: '' } });
    try {
      for (const [id, desc] of expectedTechs) {
        const techHtml = plainText(
          renderToStaticMarkup(
            createElement(
              MemoryRouter,
              { initialEntries: [`/tech/${id}`] },
              createElement(Routes, null, createElement(Route, { path: '/tech/:id', element: createElement(TechDetail) })),
            ),
          ),
        );
        expect(techHtml).toContain(desc);
        expect(techHtml).not.toContain('骑兵单位');
        expect(techHtml).not.toContain('骑马单位');
      }

      for (const [civEn, expectedDesc] of [
        ['Ethiopians', '弯刀勇士和骆驼骑兵受到骑乘单位的伤害 -3。'],
        ['Georgians', '骑乘单位所占人口空间 -20%。'],
        ['Wei', '骑乘单位近战护甲 +4。'],
      ] as const) {
        const civHtml = plainText(
          renderToStaticMarkup(
            createElement(
              MemoryRouter,
              { initialEntries: [`/civ/${civEn}`] },
              createElement(Routes, null, createElement(Route, { path: '/civ/:en', element: createElement(CivDetail, { techTree: EmptyTree }) })),
            ),
          ),
        );
        expect(civHtml).toContain(expectedDesc);
        expect(civHtml).not.toContain('骑兵单位');
        expect(civHtml).not.toContain('骑马单位');
      }

      for (const query of ['/compare?a=Ethiopians&b=Wei', '/compare?a=Georgians&b=Wei']) {
        const cmpHtml = plainText(
          renderToStaticMarkup(
            createElement(
              MemoryRouter,
              { initialEntries: [query] },
              createElement(Routes, null, createElement(Route, { path: '/compare', element: createElement(Compare) })),
            ),
          ),
        );
        expect(cmpHtml).toContain('骑乘单位');
        expect(cmpHtml).not.toContain('骑兵单位');
        expect(cmpHtml).not.toContain('骑马单位');
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
