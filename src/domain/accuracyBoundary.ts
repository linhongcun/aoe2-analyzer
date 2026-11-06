/**
 * issue 746 目录准确度与弹道学的边界说明。
 * 目录 `acc` 来自单位数据。是否进入 PK 期望命中，与 duel.ts `fighterFrom` 的 `ranged: rng > 1` 一致。
 * 弹道学是科技 93。站内效果 rules/eco 为空时，不能量化预判；即使以后有条目，也不在这里换算公式。
 * 本模块不计算命中，也不修改 PK。
 */
import { DAT, type DatFile } from './datEffects';

export const BALLISTICS_TECH_ID = 93;
export const DUEL_MODEL_PATH = '/duel#duel-model';
export const PK_UNSIMULATED = '单位 PK 未模拟弹道和走位。';
export const CATALOG_DISTINCT = '目录准确度是单位页上的百分比，进入单位 PK 的期望命中；与弹道学不是同一件事。';

export interface CatalogTech {
  id: number;
  en: string;
  zh: string;
  desc: string;
}

export interface BallisticsBoundary {
  found: boolean;
  id: number;
  en: string;
  zh: string;
  desc: string;
  rules: number;
  eco: number;
  /** 量化预判一律待确认，不从效果条目推导。 */
  preview: '待确认';
}

/** 与 `fighterFrom` 相同：只有射程大于 1 时，目录准确度才乘进期望命中。 */
export function catalogAccuracyFeedsExpectedHit(unit: { rng: number }): boolean {
  return unit.rng > 1;
}

export function ballisticsBoundary(techs: readonly CatalogTech[], dat: DatFile = DAT): BallisticsBoundary {
  const tech = techs.find((row) => row.id === BALLISTICS_TECH_ID);
  const entry = Object.values(dat.techs).find((row) => row.id === BALLISTICS_TECH_ID);
  return {
    found: !!tech,
    id: tech?.id ?? BALLISTICS_TECH_ID,
    en: tech?.en ?? '',
    zh: tech?.zh.trim() || '待确认',
    desc: tech?.desc.trim() ?? '',
    rules: entry ? entry.rules.length : -1,
    eco: entry ? entry.eco.length : -1,
    preview: '待确认',
  };
}

/** 玩家能读的弹道学边界。不写入预判角度、提前量或命中率增量。 */
export function ballisticsSentence(facts: BallisticsBoundary): string {
  const track = !facts.desc
    ? '弹道学的游戏说明待确认。'
    : facts.desc.includes('移动目标')
      ? '弹道学跟踪移动目标，站内未量化。'
      : '游戏说明没有写明对移动目标的作用。待确认。';
  const quant =
    facts.rules === 0 && facts.eco === 0
      ? '站内效果表没有可量化规则，量化预判待确认。'
      : facts.rules < 0 || facts.eco < 0
        ? '站内效果表缺少可核验规则，量化预判待确认。'
        : '站内效果表已有条目，本页不换算预判公式。量化预判待确认。';
  return track + quant;
}
