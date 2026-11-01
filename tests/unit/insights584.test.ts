import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import buildings from '../../src/data/buildings.json';
import civs from '../../src/data/civs.json';
import techs from '../../src/data/techs.json';
import units from '../../src/data/units.json';
import trees from '../../src/data/trees.json';
import { civStatus } from '../../src/domain/civStatus';
import { CIV_INSIGHTS, civInsights, insightText, UNIT_INSIGHTS, unitInsights } from '../../src/domain/insights';
import type { Trees } from '../../src/domain/types';
import { InsightSlot } from '../../src/shared/ui/InsightSlot';

const T = trees as unknown as Trees;
const unitRows = units as unknown as { id: number; cost: Record<string, number>; rng: number; ma: number }[];
const buildingRows = buildings as unknown as { en: string; rng: number; hp: number; atk: number }[];
const civRows = civs as unknown as { en: string; bon: string[] }[];
const techRows = techs as unknown as { id: number; zh: string; en: string; desc: string }[];
const unitById = (id: number) => unitRows.find((unit) => unit.id === id)!;
const building = (en: string) => buildingRows.find((row) => row.en === en)!;

describe('#584 鲜为人知槽位', () => {
  it('扈从部队挂种子①②，造价跟 units.json，驻扎加箭与塔楼加成分句', () => {
    const troop = unitById(2705);
    expect(troop.cost).toEqual({ Wood: 80, Gold: 35 });
    expect(unitById(2706).cost).toEqual(troop.cost);
    const lines = unitInsights(2705).map(insightText);
    expect(lines).toEqual([
      '近战前自带投掷标枪；造价无粮（80 木 + 35 金）。',
      '驻扎防御建筑可因自带远程/穿刺标枪增加射箭。这不是文明「塔/城堡基础箭 +100%」。',
      '无粮步兵（对照火矛兵）。',
    ]);
    expect(unitInsights(2706).map(insightText)).toEqual(lines);
    const sentences = lines
      .join('\n')
      .split(/[。！？]/)
      .map((part) => part.trim())
      .filter(Boolean);
    expect(sentences.some((text) => text.includes('驻扎') && /自带远程|穿刺标枪/.test(text))).toBe(true);
    expect(sentences.some((text) => text.includes('塔') && text.includes('城堡') && text.includes('+100%'))).toBe(true);
    expect(sentences.some((text) => text.includes('驻扎') && text.includes('+100%'))).toBe(false);
    expect(lines.join('\n')).not.toMatch(/第一个|第二个|全游戏第一个|等同步弓单兵必加/);
  });

  it('战车只挂在单位页，不写全游戏第一个，也不抄到孟加拉文明页', () => {
    expect(unitById(1759).cost).toEqual({ Wood: 60, Gold: 60 });
    expect(unitById(1761).cost).toEqual({ Wood: 60, Gold: 60 });
    const line = insightText(unitInsights(1759)[0]!);
    expect(line).toBe('无粮骑兵 UU（对照骑士线）。');
    expect(line).not.toContain('全游戏第一个');
    expect(unitInsights(1761).map(insightText)).toEqual([line]);
    expect(civInsights('Bengalis')).toEqual([]);
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
      `城镇中心生命值 +100%（2400${`\u2192`}4800，同砌体与城堡基础齐），可当前线伪城堡；须驻扎射箭单位才有输出。`,
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
    expect(filled.match(/data-testid="insight-item"/g)).toHaveLength(3);
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

  it('实现描边用边框令牌，不用线框琥珀色', () => {
    const css = readFileSync(new URL('../../src/shared/styles/editorial-details.css', import.meta.url), 'utf8');
    const block = css.slice(css.indexOf('.insight-slot {'));
    expect(block.startsWith('.insight-slot {')).toBe(true);
    expect(block).toContain('border: 1px solid var(--color-border)');
    expect(block).not.toMatch(/#(?:[0-9a-fA-F]{3,8})\b|var\(--color-accent\)/);
  });
});
