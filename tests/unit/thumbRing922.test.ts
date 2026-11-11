import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, type Core } from '../../src/data';
import { effectParts } from '../../src/domain/affects';
import { effectClause, effectSummary, techEffectEntries, thumbRingSourceSentence } from '../../src/domain/techDetailView';
import TechDetail from '../../src/features/techs/components/TechDetail';

const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const markup = (location: string) =>
  renderToStaticMarkup(
    createElement(StaticRouter, { location }, createElement(Routes, null, createElement(Route, { path: '/tech/:id', element: createElement(TechDetail) }))),
  );
const summaries = (html: string) => [...html.matchAll(/data-t="effect-summary"[^>]*>([\s\S]*?)<\/p>/g)].map((match) => visible(match[1]!));
const sourceRules = (html: string) => [...html.matchAll(/data-t="effect-source-rule"[^>]*>([\s\S]*?)<\/li>/g)].map((match) => visible(match[1]!));

let core: Core;

beforeAll(async () => {
  core = await loadCore();
});

describe('#922 扳指主摘要与可核对来源', () => {
  it('六条规则保留原始系数和各自范围，近似倍率相同也不合并', () => {
    const tech = core.techById[437]!;
    const entries = techEffectEntries(tech, core.units, core.buildings);
    expect(entries.map((entry) => entry.rofVs)).toEqual([[0.176471], [], [0.111111], [0.111116], [0.25], [0.250002]]);
    expect(entries.map((entry) => effectClause(entry.parts))).toEqual([
      `准确度 → 100，攻击间隔约 ×0.85`,
      `准确度 → 100`,
      `准确度 → 100，攻击间隔约 ×0.9`,
      `准确度 → 100，攻击间隔约 ×0.9`,
      `准确度 → 100，攻击间隔约 ×0.8`,
      `准确度 → 100，攻击间隔约 ×0.8`,
    ]);
    expect(entries[2]!.units.map((unit) => unit.id)).not.toEqual(entries[3]!.units.map((unit) => unit.id));
    expect(entries[4]!.units.map((unit) => unit.id)).not.toEqual(entries[5]!.units.map((unit) => unit.id));
    expect(entries[0]!.units.some((unit) => unit.id === 24)).toBe(true);
    expect(entries[1]!.units.some((unit) => unit.id === 6)).toBe(true);
    expect(entries[2]!.units.some((unit) => unit.id === 474)).toBe(true);
    expect(entries[3]!.units.some((unit) => unit.id === 39)).toBe(true);
    expect(entries[4]!.units.some((unit) => unit.id === 73)).toBe(true);
    expect(entries[5]!.units.some((unit) => unit.id === 559)).toBe(true);
    for (const entry of entries) {
      const shown = Number((1 / (1 + (entry.rofVs?.[0] ?? 0))).toFixed(5));
      if (!entry.rofVs?.length) expect(effectClause(entry.parts)).not.toContain('攻击间隔');
      else expect(effectClause(entry.parts)).toContain(`×${shown}`);
    }
    expect(effectParts([{ s: 'rof', v: 0.176471 }])[0]?.text).toBe('攻击速度 +18%');
    expect(effectSummary(techEffectEntries(core.techById[435]!, core.units, core.buildings)[0]!.parts)).toBe('+20 生命值（作用于下方完整名单）');
    expect(techEffectEntries(core.techById[435]!, core.units, core.buildings)[0]!.rofVs).toBeUndefined();
  });

  it('页面主摘要不写原始系数和文件名，展开区保留公式与五条精度', () => {
    const html = markup('/tech/437');
    expect(summaries(html)).toEqual([
      `准确度 → 100，攻击间隔约 ×0.85`,
      `准确度 → 100`,
      `准确度 → 100，攻击间隔约 ×0.9`,
      `准确度 → 100，攻击间隔约 ×0.9`,
      `准确度 → 100，攻击间隔约 ×0.8`,
      `准确度 → 100，攻击间隔约 ×0.8`,
    ]);
    for (const summary of summaries(html)) {
      expect(summary).not.toMatch(/v:|effects\.json|s:rof|%/);
    }
    expect(html).toMatch(/<details(?![^>]*\sopen)[^>]*data-t="effect-source"/);
    const rules = sourceRules(html);
    expect(rules).toHaveLength(6);
    expect(rules[0]).toContain('v:0.176471');
    expect(rules[1]).not.toContain('v:');
    expect(rules[1]).toContain('s:acc');
    expect(rules[2]).toContain('v:0.111111');
    expect(rules[3]).toContain('v:0.111116');
    expect(rules[4]).toContain('v:0.25');
    expect(rules[4]).not.toContain('0.250002');
    expect(rules[5]).toContain('v:0.250002');
    const sentence = thumbRingSourceSentence(188329);
    expect(sentence).toContain('攻击间隔 = 原间隔 / (1+v)');
    expect(sentence).toContain('effects.json / Thumb Ring / s:rof');
    expect(sentence).toContain('DE 188329');
    expect(visible(html)).toContain(sentence);
  });
});
