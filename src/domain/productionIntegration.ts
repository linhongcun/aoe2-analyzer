/** #531 跨工具只映射输入，不改变生产或收益的计算规则。 */
import { calculateProduction, decodeProduction, effectiveProductionTechs, productionTechs, type ProductionConfig, type ProductionContext } from './production';
import { calculateEcoPayoff, DEFAULT_PAYOFF, PAYOFF_BASELINE, PAYOFF_TARGETS, payoffAvailable, type EcoPayoffConfig } from './ecoPayoff';

export function productionSource(path: string | null): { config: ProductionConfig | null; errors: string[] } {
  if (!path || path.split('?')[0] !== '/production') return { config: null, errors: [] };
  const search = path.includes('?') ? path.slice(path.indexOf('?')) : '';
  const params = new URLSearchParams(search);
  if (['mode', 'v', 'unit', 'n', 'civs'].some((key) => params.has(key))) {
    return { config: null, errors: ['来源为跨文明训练对照，不能当作持续生产方案带入人数。'] };
  }
  const decoded = decodeProduction(search);
  return { config: decoded.errors.length ? null : decoded.config, errors: decoded.errors };
}

export function payoffFromProduction(ctx: ProductionContext, source: ProductionConfig) {
  const available = payoffAvailable(ctx, source);
  const allowed = new Set(available.map((t) => t.id));
  const selected = [...effectiveProductionTechs(ctx, source)];
  const known = selected.filter((id) => PAYOFF_BASELINE.includes(id) && allowed.has(id));
  const target =
    PAYOFF_TARGETS.find((id) => allowed.has(id) && !known.includes(id) && (!ctx.core.techById[id]?.pre || known.includes(ctx.core.techById[id]!.pre!))) ??
    PAYOFF_TARGETS.find((id) => allowed.has(id)) ??
    DEFAULT_PAYOFF.target;
  return {
    config: {
      ...DEFAULT_PAYOFF,
      civ: source.civ,
      age: source.age,
      known,
      target,
      distance: String(source.walk),
      workers: { Food: '0', Wood: '0', Gold: '0', Stone: '0' },
    } satisfies EcoPayoffConfig,
    omittedTechs: selected.filter((id) => !known.includes(id)),
  };
}

export function theoreticalProductionWorkers(ctx: ProductionContext, source: ProductionConfig) {
  const result = calculateProduction(ctx, source);
  const errors = [...result.errors];
  if (!source.rows.length) errors.push('原方案尚未添加生产需求。');
  if (result.resources.some((resource) => resource.rounded > 200)) errors.push('原方案的理论供给人数超过收益工具每资源 200 人的上限，请手动填写估算人数。');
  return {
    workers: errors.length
      ? null
      : (Object.fromEntries(result.resources.map((resource) => [resource.key, String(resource.rounded)])) as EcoPayoffConfig['workers']),
    errors,
  };
}

export function productionAssumption(ctx: ProductionContext, source: ProductionConfig, payoff: EcoPayoffConfig) {
  const errors: string[] = [];
  if (source.civ !== payoff.civ) errors.push('当前收益文明与原生产文明不同，请返回原方案核对。');
  if (source.age !== payoff.age) errors.push('当前收益时代与原生产时代不同，请返回原方案核对。');
  const result = calculateEcoPayoff(ctx, payoff);
  errors.push(...result.errors);
  const allowed = new Set(productionTechs(ctx, source).map((t) => t.id));
  if (!allowed.has(payoff.target)) errors.push('目标科技不在原生产方案的可用科技范围内。');
  const config: ProductionConfig = {
    ...source,
    rows: source.rows.map((row) => ({ ...row })),
    techs: [...new Set([...source.techs, ...payoff.known.filter((id) => allowed.has(id)), payoff.target])],
  };
  errors.push(...calculateProduction(ctx, config).errors);
  return { config: errors.length ? null : config, errors: [...new Set(errors)] };
}
