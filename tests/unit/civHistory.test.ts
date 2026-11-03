import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import civs from '../../src/data/raw/civs';
import { CIV_HISTORY, type CivHistoryEntry } from '../../src/features/civs/history';
import { CivHistory } from '../../src/features/civs/components/CivHistory';

describe('#660 官方来源文明历史', () => {
  it('逐一覆盖当前文明，不额外混入其它版本文明', () => {
    expect(Object.keys(CIV_HISTORY).sort()).toEqual(civs.map((civ) => civ.en).sort());
  });

  it.each(civs.map((civ) => civ.en))('%s 的中文摘要、官方出处及核对日期完整', (civ) => {
    const entry = CIV_HISTORY[civ]!;
    expect(entry).toBeDefined();
    expect(entry.summary.trim().length).toBeGreaterThan(25);
    expect(entry.paragraphs.length).toBeLessThanOrEqual(2);
    for (const paragraph of entry.paragraphs) expect(paragraph.trim().length).toBeGreaterThan(25);
    const url = new URL(entry.source.url);
    expect(url.protocol).toBe('https:');
    expect(['www.forgottenempires.net', 'www.ageofempires.com']).toContain(url.hostname);
    expect(entry.source.label.trim()).not.toBe('');
    expect(entry.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(entry.checkedOn))).toBe(false);
  });

  it('新文明没有核实条目时显示核对中，不生成来源或空展开控件', () => {
    const html = renderToStaticMarkup(createElement(CivHistory, { civ: 'Unknown' }));
    expect(html).toContain('该文明的官方历史资料仍在核对中。');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<details');
  });

  it('只有官方短介绍时保留摘要与来源，没有空展开控件；年份不换行', () => {
    const entry: CivHistoryEntry = {
      summary: '这是一段仅用于验证展示状态的测试摘要，581年与907—1125年保持完整。',
      paragraphs: [],
      source: { label: '测试来源', url: 'https://www.ageofempires.com/' },
      checkedOn: '2026-11-03',
    };
    const html = renderToStaticMarkup(createElement(CivHistory, { civ: 'Fixture', entry }));
    expect(html).toContain(entry.source.url);
    expect(html).toContain('官方原文');
    expect(html).toContain('<span class="num nw">581年</span>');
    expect(html).toContain('<span class="num nw">907—1125年</span>');
    expect(html).not.toContain('<details');
  });
});
