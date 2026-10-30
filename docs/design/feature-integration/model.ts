import { civs } from '../../../src/data';
import { calculateProduction, encodeProduction, productionUnits, productionBuildings, type ProductionContext } from '../../../src/domain/production';
import { calculateEcoPayoff, payoffAvailable, PAYOFF_BASELINE, PAYOFF_TARGETS } from '../../../src/domain/ecoPayoff';
import { unitPath } from '../../../src/domain/simRoute';
import { tradeIncomeProductionHref } from '../../../src/domain/tradeIncome';
import type { State } from './state';
export function modelFor(ctx: ProductionContext, state: State) {
  const { config, payoff } = state;
  const result = calculateProduction(ctx, config);
  const row = config.rows[0]!;
  const unit = ctx.core.unitById[row.unit];
  const own = civs.find((c) => c.en === config.civ)!;
  const enemy = civs.find((c) => c.en === state.opp)!;
  const sourceOwn = civs.find((c) => c.en === state.sourceMe)!;
  const units = productionUnits(ctx, config);
  const buildings = unit ? productionBuildings(ctx, config, unit) : [];
  const eligible = payoffAvailable(ctx, config).filter((t) => PAYOFF_TARGETS.some((id) => id === t.id));
  const payoffResult = calculateEcoPayoff(ctx, payoff);
  const known = config.techs.filter((id) => PAYOFF_BASELINE.includes(id) && payoffAvailable(ctx, config).some((t) => t.id === id));
  const baseline = calculateProduction(ctx, { ...config, rows: [{ ...row, count: String(Math.max(0, +row.count - 1)) }] });
  const productionPath = '/production?' + encodeProduction(config);
  const unitRoute =
    unitPath(row.unit, config.civ, config.age, [], []) + '?' + new URLSearchParams({ tab: 'sim', civ: config.civ, me: state.sourceMe, opp: state.opp });
  return {
    config,
    payoff,
    result,
    row,
    unit,
    own,
    enemy,
    sourceOwn,
    units,
    buildings,
    eligible,
    payoffResult,
    known,
    baseline,
    productionPath,
    unitRoute,
    tradePath: tradeIncomeProductionHref(config),
  };
}
export type Model = ReturnType<typeof modelFor>;
