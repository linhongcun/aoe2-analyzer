import { createRequire } from 'node:module';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import UnitGarrison from '../../src/features/units/components/UnitGarrison';
import * as summary from '../../src/features/units/garrisonSummary';
import * as model from '../../src/domain/garrisonGeneral';

const require = createRequire(import.meta.url);
const { createElement } = require('react') as typeof import('react');
const { MemoryRouter } = require('react-router-dom') as typeof import('react-router-dom');
const { create, act } = require('react-test-renderer') as typeof import('react-test-renderer');
let props: Parameters<typeof UnitGarrison>[0];
beforeAll(async () => {
  props = { core: await loadCore(), trees: await loadTrees(), unitId: 751, civ: 'Aztecs', error: false, pending: false, retry: () => {} };
});
afterEach(() => vi.restoreAllMocks());
const element = (p: typeof props) =>
  createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(UnitGarrison, p));

it('#1051 memo复用稳定输入；文明/单位/core/trees变更重算，过渡状态清旧链接', () => {
  const spy = vi.spyOn(summary, 'unitGarrisonSummary');
  const calculate = vi.spyOn(model, 'calculateGeneralGarrison');
  let renderer!: ReturnType<typeof create>;
  let current = props;
  act(() => {
    renderer = create(element(props));
  });
  const links = () =>
    renderer.root
      .findAllByType('a')
      .map((a) => String(a.props.href))
      .filter((href) => href.startsWith('/building/'));
  const update = (next: Partial<typeof props>) => {
    current = { ...current, ...next };
    act(() => renderer.update(element(current)));
  };
  try {
    expect(spy).toHaveBeenCalledTimes(1);
    expect(links().some((href) => href.includes('age=1') && href.includes('751%3A15%3Ae'))).toBe(true);
    const calls = calculate.mock.calls.length;
    update({ retry: vi.fn() });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(calculate).toHaveBeenCalledTimes(calls);
    update({ civ: 'Mayans' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(links().every((href) => href.includes('civ=Mayans'))).toBe(true);
    update({ unitId: 93 });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(links().every((href) => !href.includes('751'))).toBe(true);
    update({ trees: { ...props.trees! } });
    expect(spy).toHaveBeenCalledTimes(4);
    update({ core: { ...props.core } });
    expect(spy).toHaveBeenCalledTimes(5);
    for (const next of [{ trees: null, pending: true }, { trees: null, error: true }, { civ: '' }, { civ: 'Incas' }, { unitId: 280, civ: 'Franks' }]) {
      update({ ...props, ...next });
      expect(links()).toEqual([]);
      expect(renderer.root.findAll((n) => n.props['data-garrison-total'] !== undefined)).toEqual([]);
    }
  } finally {
    act(() => renderer.unmount());
  }
});
