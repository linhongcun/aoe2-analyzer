import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { civByEn } from '../../src/data';
import eco from '../../src/data/raw/eco';
import { ArenaCastleGoldView } from '../../src/features/civs/components/ArenaCastleGold';
import {
  ARENA_CASTLE_GOLD_CHECKED,
  OFFICIAL_AGE_HREF,
  OFFICIAL_VARANGIAN_HREF,
  STANDARD_START_GOLD,
  arenaCastleGold,
  arenaCastleGoldText,
  type ArenaCastleCiv,
  type ArenaCastleGold,
  type ArenaEco,
} from '../../src/features/civs/arenaCastleGold';

const live = eco as unknown as ArenaEco;
const markup = (card: ArenaCastleGold) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: `/civ/${card.civ}` }, createElement(ArenaCastleGoldView, { card })));
const visible = (html: string) => html.replace(/<[^>]*>/g, '');
const line = (card: ArenaCastleGold, id: string) => {
  const found = card.lines.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found.parts.map((part) => (part.kind === 'text' ? part.text : part.parts.map((item) => item.text).join(''))).join('');
};
const techCost = (id: string) => live.techs?.[id]?.cost;

describe('#757 竞技场不挖金的黄金收支', () => {
  it('只挂三个文明，越南和其他文明没有这张说明', () => {
    expect(arenaCastleGold('Muisca', live)?.civ).toBe('Muisca');
    expect(arenaCastleGold('Ethiopians', live)?.civ).toBe('Ethiopians');
    expect(arenaCastleGold('Varangians', live)?.civ).toBe('Varangians');
    for (const civ of ['Vietnamese', 'Britons', 'Franks', 'Generic']) expect(arenaCastleGold(civ, live)).toBeNull();
  });

  it('城堡、封建和织布的费用跟固定数据包走', () => {
    expect(techCost('101')).toEqual({ Food: 500 });
    expect(techCost('102')).toEqual({ Food: 800, Gold: 200 });
    expect(techCost('22')).toEqual({ Gold: 50 });
    expect(STANDARD_START_GOLD).toBe(100);
    for (const civ of ['Muisca', 'Ethiopians', 'Varangians'] as const) {
      const card = arenaCastleGold(civ, live)!;
      expect(line(card, 'start')).toBe('100 黄金');
      expect(line(card, 'castle')).toBe('800 食物 + 200 黄金');
      expect(line(card, 'loom')).toBe('50 黄金');
      expect(line(card, 'patch')).toBe('DE Update 188329 (2026-10-28)');
      expect(line(card, 'checked')).toBe(ARENA_CASTLE_GOLD_CHECKED);
      expect(arenaCastleGoldText(card)).toContain('不是已实测的完整直城流程');
      expect(arenaCastleGoldText(card)).toContain('也不表示一定成功');
      expect(arenaCastleGoldText(card)).toContain('不等于没有黄金收入');
      expect(arenaCastleGoldText(card)).not.toContain('实测通过');
      expect(arenaCastleGoldText(card)).not.toContain('必定成功');
      expect(arenaCastleGoldText(card)).toContain('不写固定人数和时间');
      expect(arenaCastleGoldText(card)).not.toMatch(/\d+\s*人/);
      expect(arenaCastleGoldText(card)).not.toContain('10%');
      expect(arenaCastleGoldText(card)).not.toContain('10.01');
      expect(arenaCastleGoldText(card)).not.toContain('1000');
      expect(arenaCastleGoldText(card)).not.toContain('1500');
    }
  });

  it('穆伊斯卡只把升级时代的黄金乘 0.5，先织布要另补', () => {
    const card = arenaCastleGold('Muisca', live)!;
    expect(civByEn('Muisca')?.bon).toContain('进入下一个时代所需黄金成本 -50%');
    expect(line(card, 'click')).toBe('100 黄金');
    expect(line(card, 'plain')).toBe('手头 100 黄金，差额 0 黄金');
    expect(line(card, 'loom-first')).toBe('手头 50 黄金，还差 50 黄金');
    expect(line(card, 'castle')).toContain('800 食物');
    expect(arenaCastleGoldText(card)).toContain('食物不减');
    expect(arenaCastleGoldText(card)).toContain('升封建不花黄金');
    const changed = structuredClone(live);
    changed.techs!['102']!.cost = { Food: 800, Gold: 300 };
    const next = arenaCastleGold('Muisca', changed)!;
    expect(line(next, 'click')).toBe('150 黄金');
    expect(line(next, 'plain')).toBe('手头 100 黄金，还差 50 黄金');
    const halvedFood = structuredClone(live);
    halvedFood.civEco!.Muisca = (halvedFood.civEco!.Muisca as object[]).map((row) => {
      const item = row as { tech?: number; effects?: { kind?: string; res?: string; v?: number }[] };
      if (item.tech !== 1367) return row;
      return { ...item, effects: [...item.effects!, { kind: 'techCost', op: 'mul', res: 'Food', tech: 102, v: 0.5 }] };
    });
    expect(arenaCastleGold('Muisca', halvedFood)).toBeNull();
  });

  it('埃塞俄比亚封建到账能付城堡，城堡到账和特殊开局不能拿来付点击', () => {
    const card = arenaCastleGold('Ethiopians', live)!;
    expect(civByEn('Ethiopians')?.bon[0]).toBe('升级到下一时代时获得的黄金 +100、食物 +100');
    expect(line(card, 'feudal-grant')).toBe('100 食物 + 100 黄金');
    expect(line(card, 'plain')).toBe('手头 200 黄金，差额 0 黄金');
    expect(line(card, 'loom-first')).toBe('手头 150 黄金，还差 50 黄金');
    expect(line(card, 'castle-grant')).toBe('100 食物 + 100 黄金');
    const text = arenaCastleGoldText(card);
    expect(text).toContain('封建研究完成之后、点城堡之前');
    expect(text).toContain('不能支付点击城堡的费用');
    expect(text).toContain('不计入这条标准黑暗开局');
    expect(line(card, 'plain')).not.toContain('300');
    const changed = structuredClone(live);
    const rows = changed.civEco!.Ethiopians as { tech?: number; requires?: number[]; effects?: { res?: number; v?: number }[] }[];
    rows.find((row) => row.tech === 587)!.effects!.find((effect) => effect.res === 3)!.v = 80;
    expect(line(arenaCastleGold('Ethiopians', changed)!, 'plain')).toBe('手头 180 黄金，还差 20 黄金');
    rows.find((row) => row.tech === 588)!.requires = [];
    expect(arenaCastleGold('Ethiopians', changed)).toBeNull();
  });

  it('瓦兰吉只列牧羊和狩猎，比例与采集量待确认', () => {
    const card = arenaCastleGold('Varangians', live)!;
    expect(civByEn('Varangians')?.bon[0]).toBe('牧羊、捕鱼和狩猎也能产生黄金');
    expect(line(card, 'sources')).toBe('牧羊、狩猎');
    expect(line(card, 'plain')).toBe('至少 100 黄金');
    expect(line(card, 'loom-first')).toBe('至少 150 黄金');
    expect(line(card, 'ratio')).toBe('待确认');
    expect(line(card, 'gather')).toBe('待确认');
    expect(card.lines.find((item) => item.id === 'ratio')?.pending).toBe(true);
    const text = arenaCastleGoldText(card);
    expect(text).toContain('捕鱼不是竞技场的默认资源');
    expect(text).toContain('浆果、农田和其他食物也不写成这条产金');
    expect(text).toContain('不保证地图上的羊和猎物一定够');
    expect(text).not.toContain('10%');
    expect(text).not.toContain('10.01');
    expect(text).not.toContain('1000');
    expect(text).not.toContain('1500');
    expect(card.links.find((item) => item.id === 'official-varangians')?.href).toBe(OFFICIAL_VARANGIAN_HREF);
    expect(card.links.find((item) => item.id === 'official-age')?.href).toBe(OFFICIAL_AGE_HREF);
    const changed = structuredClone(live);
    changed.civEco!.Varangians = (changed.civEco!.Varangians as { tech?: number }[]).filter((row) => row.tech !== 1475);
    expect(arenaCastleGold('Varangians', changed)).toBeNull();
  });

  it('说明渲染在文明页用的同一张卡上，并链到城堡与织布', () => {
    for (const civ of ['Muisca', 'Ethiopians', 'Varangians'] as ArenaCastleCiv[]) {
      const html = markup(arenaCastleGold(civ, live)!);
      expect(html).toContain('data-civ="' + civ + '"');
      expect(html).toContain('href="/tech/102"');
      expect(html).toContain('href="/tech/22"');
      expect(html).toContain(OFFICIAL_AGE_HREF);
      expect(visible(html)).toContain('竞技场黄金收支');
    }
    const ethiopian = visible(markup(arenaCastleGold('Ethiopians', live)!));
    expect(ethiopian).toContain('不能支付点击城堡的费用');
    const varangianHtml = markup(arenaCastleGold('Varangians', live)!);
    expect(visible(varangianHtml)).toContain('待确认');
    expect(varangianHtml).toContain(OFFICIAL_VARANGIAN_HREF);
  });
});
