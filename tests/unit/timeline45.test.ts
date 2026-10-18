import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import eco from '../../src/data/eco.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData } from '../../src/domain/buildSim';
import { followupHint, stepEntities, villagerGroups } from '../../src/features/builds/timelineFollowups';
import BuildTimelineView from '../../src/features/builds/BuildTimelineView';

afterEach(() => vi.unstubAllGlobals());
const bo = buildOrders.find((b) => b.id === 'scouts-18')!;
const tl = simulateBuild(bo, 'Generic', eco as unknown as EcoData, {});
it('实际村民事件只按连续区间合并，造房会断开组', () => {
  const events = [
    { from: 0, to: 25, step: 0 },
    { from: 25, to: 50, step: 0 },
    { from: 50, to: 75, step: 1 },
    { from: 80, to: 105, step: 2 },
  ];
  const input = { ...tl, villagerEvents: events, steps: [], anomalies: [], housePaidAt: [40] };
  expect(villagerGroups(input).map((g) => g.length)).toEqual([2, 1, 1]);
  expect(villagerGroups(tl).flat()).toEqual(tl.villagerEvents);
  expect(tl.villagerEvents!.every((v) => v.to > v.from)).toBe(true);
});
it('人口接近上限有后续提示，不需要房子的文明不提示', () => {
  const step = { ...tl.steps[0]!, pop: { used: 13, cap: 15 } };
  expect(followupHint(step, false)).toContain('补房子');
  expect(followupHint(step, true)).toBeNull();
  expect(followupHint({ ...step, pop: { used: 13, cap: 20 } }, false)).toBeNull();
});
it('单位、建筑、科技均取结构化动作，多个同类实体不漏掉', () => {
  expect(
    stepEntities({
      vils: 3,
      actions: [
        { type: 'build', building: 70 },
        { type: 'research', tech: 22 },
        { type: 'train', unit: 83 },
        { type: 'train', unit: 83 },
      ],
    }),
  ).toEqual([
    { kind: 'building', id: 70 },
    { kind: 'tech', id: 22 },
    { kind: 'unit', id: 83 },
  ]);
});
it.each([[], undefined])('没有 sources 的真实页面不会渲染来源或 undefined', (sources) => {
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  vi.stubGlobal('location', { host: 'example.test', pathname: '/' });
  const injected = { ...bo, sources } as typeof bo;
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ['/builds?bo=scouts-18'] }, createElement(BuildTimelineView, { orders: [injected] })),
  );
  expect(html).not.toContain('来源');
  expect(html).not.toContain('undefined');
  expect(html).toContain('scouts-18');
});
