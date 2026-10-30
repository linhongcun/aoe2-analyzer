import { civs } from '../../../src/data';
import { decodeProduction, encodeProduction, type ProductionConfig } from '../../../src/domain/production';
import { decodeEcoPayoff, encodeEcoPayoff, DEFAULT_PAYOFF, type EcoPayoffConfig } from '../../../src/domain/ecoPayoff';

export type View = 'unit' | 'production' | 'payoff';
export type State = {
  view: View;
  config: ProductionConfig;
  sourceMe: string;
  opp: string;
  payoff: EcoPayoffConfig;
  people: 'none' | 'theory' | 'adjusted' | 'manual';
  compare: boolean;
};
export const initial: State = {
  view: 'production',
  opp: 'Britons',
  sourceMe: 'Franks',
  compare: false,
  people: 'none',
  config: { civ: 'Franks', age: 3, techs: [], walk: 3, farm: 1, rows: [{ unit: 38, building: 101, count: '2' }] },
  payoff: { ...DEFAULT_PAYOFF, age: 3, target: 55, workers: { Food: '0', Wood: '0', Gold: '0', Stone: '0' } },
};

// Only the prototype uses this envelope. Production URL contracts remain unchanged.
export function readState(): State {
  const p = new URLSearchParams(window.location.hash.slice(1));
  if (!p.has('production')) return initial;
  const production = decodeProduction(p.get('production') ?? '');
  const payoff = decodeEcoPayoff(p.get('payoff') ?? '');
  if (production.errors.length || payoff.errors.length) throw new Error('原型链接包含无效设置。请用“重置原型”恢复示例。');
  if (production.config.rows.length !== 1) throw new Error('本原型演示单条生产需求；多条或空需求请在正式工具中查看，或重置原型。');
  const view = p.get('view');
  if (
    (view === 'payoff' || ['theory', 'adjusted', 'manual'].includes(p.get('people') ?? '')) &&
    (payoff.config.civ !== production.config.civ || payoff.config.age !== production.config.age || Number(payoff.config.distance) !== production.config.walk)
  ) {
    throw new Error('收益条件与来源生产方案不一致。请重置原型后重新带入。');
  }
  const people = p.get('people');
  return {
    config: production.config,
    payoff: payoff.config,
    view: view === 'unit' || view === 'payoff' ? view : 'production',
    opp: civs.some((c) => c.en === p.get('opp')) ? p.get('opp')! : initial.opp,
    sourceMe: civs.some((c) => c.en === p.get('sourceMe')) ? p.get('sourceMe')! : initial.sourceMe,
    people: people === 'theory' || people === 'adjusted' || people === 'manual' ? people : 'none',
    compare: p.get('compare') === '1',
  };
}
export function stateHash(s: State) {
  return (
    '#' +
    new URLSearchParams({
      view: s.view,
      production: encodeProduction(s.config),
      payoff: encodeEcoPayoff(s.payoff),
      opp: s.opp,
      sourceMe: s.sourceMe,
      people: s.people,
      compare: s.compare ? '1' : '0',
    })
  );
}
