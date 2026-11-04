import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, type Core } from '../../src/data';
import buildings from '../../src/data/buildings.json';
import civs from '../../src/data/civs.json';
import techs from '../../src/data/techs.json';
import units from '../../src/data/units.json';
import trees from '../../src/data/trees.json';
import { civStatus } from '../../src/domain/civStatus';
import { CIV_INSIGHTS, civInsights, insightText, UNIT_INSIGHTS, unitInsights } from '../../src/domain/insights';
import { buildFamilies } from '../../src/domain/family';
import type { Trees, Unit } from '../../src/domain/types';
import UnitDetail from '../../src/features/units/components/UnitDetail';
import { InsightSlot } from '../../src/shared/ui/InsightSlot';

const detailState = vi.hoisted(() => ({ core: null as Core | null }));
vi.mock('../../src/data/hooks', () => ({ useCore: () => detailState.core, useTrees: () => T }));
// UnitDetail opts into independent resources; keep the same injected source fixture.
vi.mock('../../src/shared/utils/useCoreTrees', () => ({
  useCoreTrees: () => ({
    core: { data: detailState.core, pending: !detailState.core, error: false, retry: () => {} },
    trees: { data: T, pending: false, error: false, retry: () => {} },
    retry: () => {},
  }),
}));

const T = trees as unknown as Trees;
const unitRows = units as unknown as { id: number; cost: Record<string, number>; rng: number; ma: number }[];
const buildingRows = buildings as unknown as { en: string; rng: number; hp: number; atk: number }[];
const civRows = civs as unknown as { en: string; bon: string[] }[];
const techRows = techs as unknown as { id: number; zh: string; en: string; desc: string }[];
const unitById = (id: number) => unitRows.find((unit) => unit.id === id)!;
const building = (en: string) => buildingRows.find((row) => row.en === en)!;

describe('#585 战车真实单位页训练造价', () => {
  const trainingNote = '训练不消耗食物。';
  let fixedCore: Core;
  beforeAll(async () => {
    fixedCore = await loadCore();
  });

  function renderDetail(id: number, replacement?: Unit) {
    const displayUnits = replacement ? fixedCore.units.map((unit) => (unit.id === id ? replacement : unit)) : fixedCore.units;
    const unitIndex = replacement ? { ...fixedCore.unitById, [id]: replacement } : fixedCore.unitById;
    detailState.core = replacement ? { ...fixedCore, units: displayUnits, unitById: unitIndex, fam: buildFamilies(displayUnits, unitIndex) } : fixedCore;
    return renderToStaticMarkup(createElement(StaticRouter, { location: `/unit/${id}` }, createElement(UnitDetail)));
  }

  function section(html: string, label: string) {
    const content = html.match(new RegExp(`<section\\b[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)<\\/section>`))?.[1];
    expect(content, `真实页面应有${label}分区`).toBeDefined();
    return content!;
  }

  it.each([1759, 1761])('单位 %i 在真实造价分区明确训练不消耗食物', (id) => {
    const html = renderDetail(id);
    const cost = section(html, '造价与生产');
    expect(cost).toMatch(/alt="木材"[^>]*>60</);
    expect(cost).toMatch(/alt="黄金"[^>]*>60</);
    expect(cost).not.toContain('alt="食物"');
    expect(html).toContain('data-testid="insight-empty">暂无</p>');
    expect(cost).toContain(trainingNote);
    expect(cost.indexOf(trainingNote)).toBeGreaterThan(cost.indexOf('</dl>'));
    expect(cost.indexOf(trainingNote)).toBeLessThan(cost.indexOf('class="rc-uline"'));
  });

  it.each([38, 1962, 39])('真实单位 %i 不按名字或全部无粮成本误显示提示', (id) => {
    const cost = section(renderDetail(id), '造价与生产');
    expect(cost).not.toContain(trainingNote);
  });

  it.each([1759, 1761])('单位 %i 若来源成本增加食物，真实页面显示成本并撤下无粮提示', (id) => {
    const original = fixedCore.unitById[id]!;
    const originalCost = JSON.stringify(original.cost);
    const replacement: Unit = { ...original, cost: { ...original.cost, Food: 1 } };
    const cost = section(renderDetail(id, replacement), '造价与生产');
    expect(cost).toMatch(/alt="食物"[^>]*>1</);
    expect(cost).toMatch(/alt="木材"[^>]*>60</);
    expect(cost).toMatch(/alt="黄金"[^>]*>60</);
    expect(cost).not.toContain(trainingNote);
    expect(JSON.stringify(original.cost)).toBe(originalCost);
    expect(fixedCore.unitById[id]).toBe(original);
  });

  it('训练无粮不抹去真实精锐升级的800食物、800木材和45秒', () => {
    const upgrade = section(renderDetail(1761), '精锐升级');
    expect(upgrade).toMatch(/alt="食物"[^>]*>800</);
    expect(upgrade).toMatch(/alt="木材"[^>]*>800</);
    expect(upgrade).toContain('45s');
    expect(upgrade).not.toContain(trainingNote);
  });
});

describe('#584 鲜为人知槽位', () => {
  it('扈从部队只挂已批准的两条，不含驻扎因果句', () => {
    const troop = unitById(2705);
    expect(troop.cost).toEqual({ Wood: 80, Gold: 35 });
    expect(unitById(2706).cost).toEqual(troop.cost);
    const lines = unitInsights(2705).map(insightText);
    expect(lines).toEqual(['近战前自带投掷标枪，无需先研远程科技；造价无粮（80 木 + 35 金）。', '无粮步兵（对照火矛兵）。']);
    expect(unitInsights(2706).map(insightText)).toEqual(lines);
    expect(lines.join('\n')).not.toMatch(/驻扎|基础箭|\+100%/);
    expect(lines.join('\n')).not.toMatch(/第一个|第二个|全游戏第一个|等同步弓单兵必加/);
  });

  it.each([2705, 2706])('#582 单位 %i 的基础标枪明确无需先研远程科技', (id) => {
    const javelin = unitInsights(id).find((item) => item.id === 'hearth-javelin');
    expect(javelin).toBeDefined();
    expect(insightText(javelin!)).toContain('无需先研远程科技');
  });

  it('战车种子③只挂孟加拉，普通和精锐单位保留空槽', () => {
    expect(unitById(1759).cost).toEqual({ Wood: 60, Gold: 60 });
    expect(unitById(1761).cost).toEqual({ Wood: 60, Gold: 60 });
    expect(unitInsights(1759)).toEqual([]);
    expect(unitInsights(1761)).toEqual([]);
    expect(civInsights('Bengalis').map(insightText)).toEqual(['战车造价无粮（60 木 + 60 金）。', '无粮骑兵 UU（对照骑士线）。']);
    expect(civInsights('Bengalis').map(insightText).join('\n')).not.toContain('第一个');
  });

  it('马里只写蛮王 8 箭 / 满驻 18，不写旧 +5，不和山城堡混在一条', () => {
    const lines = civInsights('Malians').map(insightText);
    expect(lines).toEqual(['蛮王：空城镇中心也能射 8 箭（满驻上限 18）。', '驻扎仍可再加箭。利于前线推进 / TC 对射。']);
    expect(lines.join('\n')).not.toMatch(/\+5|＋5|山城堡|射程/);
  });

  it('山城堡、邑城、开垛口的数字跟建筑射程和科技树，禁写反制或大学线', () => {
    expect(building('Town Center').rng).toBe(6);
    expect(building('Watch Tower').rng).toBe(8);
    expect(building('Castle').rng).toBe(8);
    expect(unitById(24).rng).toBeLessThan(9);
    expect(unitById(280).rng).toBe(7);
    expect(unitById(550).rng).toBe(8);
    expect(unitById(331).rng).toBe(16);
    expect(unitById(36).rng).toBe(12);
    expect(civStatus(T, 'Koreans')['t199']).toBe(1);
    expect(civStatus(T, 'Koreans')['t200']).toBe(1);
    expect(civStatus(T, 'Koreans')['t201']).toBe(1);
    expect(civStatus(T, 'Koreans')['t486']).toBe(1);
    expect(civStatus(T, 'Teutons')['t199']).toBe(1);
    expect(civStatus(T, 'Teutons')['t200']).toBe(1);
    expect(civStatus(T, 'Teutons')['t201']).toBe(0);
    expect(8 + 2 + 3).toBe(13);
    expect(8 + 3 + 1 + 1).toBe(13);

    const hill = civInsights('Lithuanians').map(insightText).join('\n');
    expect(hill).toContain(`6${`\u2192`}9`);
    expect(hill).toContain('盖过弩手和投石车');
    expect(hill).toContain('盖不住投石机');
    expect(hill).not.toMatch(/反制投石机|不怕投石机|手推炮|蛮王/);

    const koreans = civInsights('Koreans').map(insightText).join('\n');
    expect(koreans).toContain('叠满箭羽线');
    expect(koreans).toContain('13');
    expect(koreans).toContain('手推炮');
    expect(koreans).toContain('12');
    expect(koreans).not.toContain('盖不住');

    const teutons = civInsights('Teutons').map(insightText).join('\n');
    expect(teutons).toContain('叠箭羽+锥子');
    expect(teutons).toContain('13');
    expect(teutons).toContain('手推炮');
    expect(teutons).not.toMatch(/大学|不怕|护腕/);
  });

  it('撒克逊送石和印加减石不锁未核实换算', () => {
    const saxons = civInsights('Saxons').map(insightText).join('\n');
    expect(saxons).toBe('磨坊、木营、采矿场建成得石，利于早塔/防塔爆。');
    expect(saxons).not.toMatch(/箭塔|食物|\+50|\+35|≈/);
    const incas = civInsights('Incas').map(insightText).join('\n');
    expect(incas).toBe('开局 200 石可盖城镇中心 + 瞭望箭塔。');
    expect(incas).not.toContain('多送');
  });

  it('诸葛弩 73/559 挂种子⑩锁句，不写攻城加成或绝对反制', () => {
    expect(unitById(1258).ma).toBe(-3);
    expect(unitById(422).ma).toBe(-2);
    expect(unitById(548).ma).toBe(-1);
    const lines = ['非精锐每轮 3 箭、精锐 5 箭；次级弹含 0 近战，对负甲冲车有额外咬伤。', '成群可远程磨掉冲车突袭。'];
    expect(unitInsights(73).map(insightText)).toEqual(lines);
    expect(unitInsights(559)).toBe(unitInsights(73));
    const body = lines.join('\n');
    expect(body).not.toMatch(/攻城加成|克制冲车|不怕冲车|绝对反制/);
    expect(civRows.some((civ) => civ.en === 'Chinese')).toBe(true);
    expect(civInsights('Chinese')).toEqual([]);
  });

  it('波斯挂种子⑪锁句：城镇中心血量对齐城堡基础，不写火力相等或免黄金', () => {
    expect(building('Town Center').hp).toBe(2400);
    expect(building('Castle').hp).toBe(4800);
    expect(building('Town Center').atk).toBe(5);
    expect(building('Castle').atk).toBe(11);
    const persians = civRows.find((civ) => civ.en === 'Persians');
    expect(persians?.bon.some((line) => line.includes('城镇中心和码头的生命值 +100%'))).toBe(true);
    const kamandaran = techRows.find((tech) => tech.id === 488);
    expect(kamandaran?.zh).toBe('波斯步弓手');
    expect(kamandaran?.en).toBe('Kamandaran');
    expect(kamandaran?.desc).toContain('木材');
    expect(kamandaran?.desc).toContain('黄金');
    expect(kamandaran?.desc).not.toContain('免费');
    expect(techRows.find((tech) => tech.id === 50)?.desc).toContain('生命值 +10%');

    const lines = civInsights('Persians').map(insightText);
    expect(lines).toEqual([
      `城镇中心生命值 +100%（2400${`\u2192`}4800，同砌体与城堡基础齐），可当前线伪城堡。`,
      '叠波斯步弓手（Kamandaran）后弓兵木代金（非免费）。',
    ]);
    expect(lines.join('\n')).not.toMatch(/火力等于城堡|绝对反制|免黄金|免费弓/);
    expect(unitInsights(109)).toEqual([]);
  });

  it('骑士和法兰克是空槽，单位页和文明页不共用同一句', () => {
    expect(unitInsights(38)).toEqual([]);
    expect(civInsights('Franks')).toEqual([]);
    const unitTexts = new Set(Object.values(UNIT_INSIGHTS).flat().map(insightText));
    const civTexts = new Set(Object.values(CIV_INSIGHTS).flat().map(insightText));
    for (const text of unitTexts) expect(civTexts.has(text)).toBe(false);
  });

  it('槽位标记空/有内容，数字包在不换行的节点里', () => {
    const filled = renderToStaticMarkup(createElement(InsightSlot, { items: unitInsights(2705) }));
    expect(filled).toContain('data-testid="insight-slot"');
    expect(filled).toContain('data-state="filled"');
    expect(filled).not.toContain('insight-empty');
    expect(filled.match(/data-testid="insight-item"/g)).toHaveLength(2);
    expect(filled).toContain('<span class="nw"><span class="num">80</span><span> 木 + </span><span class="num">35</span><span> 金</span></span>');
    const malians = renderToStaticMarkup(createElement(InsightSlot, { items: civInsights('Malians') }));
    expect(malians).toContain('<span class="nw"><span class="num">8</span><span> 箭</span></span>');
    expect(malians).toContain('<span class="nw"><span class="num">18</span></span>');
    expect(malians).not.toContain('insight-empty');
    const chuKoNu = renderToStaticMarkup(createElement(InsightSlot, { items: unitInsights(73) }));
    expect(chuKoNu.match(/data-testid="insight-item"/g)).toHaveLength(2);
    expect(chuKoNu).toContain('<span class="nw"><span class="num">3</span><span> 箭</span></span>');
    expect(chuKoNu).toContain('<span class="nw"><span class="num">5</span><span> 箭</span></span>');
    expect(chuKoNu).toContain('<span class="nw"><span class="num">0</span><span> 近战</span></span>');
    const persians = renderToStaticMarkup(createElement(InsightSlot, { items: civInsights('Persians') }));
    expect(persians).toContain('<span class="nw"><span class="num">+100</span><span>%</span></span>');
    expect(persians).toContain(`<span class="nw"><span class="num">2400</span><span>${`\u2192`}</span><span class="num">4800</span></span>`);
    const empty = renderToStaticMarkup(createElement(InsightSlot, { items: [] }));
    expect(empty).toContain('data-state="empty"');
    expect(empty).toContain('data-testid="insight-empty">暂无</p>');
    expect(empty).not.toContain('insight-item');
  });

  it('同一组件可承载1/2/3条已核实内容，条数变化不改槽位外壳', () => {
    // 只组合现有事实验证展示容量，不向生产配置添加测试用内容。
    const fixture = [unitInsights(2705)[0]!, unitInsights(73)[0]!, civInsights('Malians')[0]!];
    const shells = [1, 2, 3].map((count) => {
      const items = fixture.slice(0, count);
      const html = renderToStaticMarkup(createElement(InsightSlot, { items }));
      expect(html.match(/data-testid="insight-item"/g)).toHaveLength(count);
      expect(html.match(/<section/g)).toHaveLength(1);
      expect(html.match(/<h2/g)).toHaveLength(1);
      expect(html.match(/<ul/g)).toHaveLength(1);
      return html.replace(/<ul\b[^>]*>.*?<\/ul>/s, '<ul></ul>');
    });
    expect(shells[1]).toBe(shells[0]);
    expect(shells[2]).toBe(shells[0]);
  });

  it('实现描边用边框令牌，不用线框琥珀色', () => {
    const css = readFileSync(new URL('../../src/shared/styles/editorial-details.css', import.meta.url), 'utf8');
    const block = css.slice(css.indexOf('.insight-slot {'));
    expect(block.startsWith('.insight-slot {')).toBe(true);
    expect(block).toContain('border: 1px solid var(--color-border)');
    expect(block).not.toMatch(/#(?:[0-9a-fA-F]{3,8})\b|var\(--color-accent\)/);
  });
});
