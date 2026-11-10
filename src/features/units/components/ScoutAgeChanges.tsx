import { Link } from 'react-router-dom';
import { DAT, toEffects, type DatGeneric } from '../../../domain/datEffects';
import { AGE_ZH } from '../../../domain/ratings';
import { applyEffects, baseStats } from '../../../domain/simulator';
import type { Unit } from '../../../domain/types';
import { DetailSection, StatTiles } from '../../../shared/ui/DetailBlocks';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';

const stats = [
  ['atk', '攻击'],
  ['los', '视野'],
  ['spd', '移动速度'],
] as const;
const format = (value: number) => Number(value.toFixed(3));
type Values = Record<(typeof stats)[number][0], number>;

/** 本刀只投影已核的侦察自动规则，不读取文明或研究科技。 */
export function scoutAgeChange(
  unit: Unit,
  source: readonly DatGeneric[] = DAT.generic,
): { state: 'ready'; age: number; tech: number; before: Values; after: Values } | { state: 'pending' } | null {
  if (unit.id !== 448) return null;
  const entries = source.filter((entry) => entry.tech === 20 && entry.any === false && entry.req.length === 0);
  const entry = entries[0];
  if (entries.length !== 1 || !entry || ![2, 3, 4].includes(entry.age) || !stats.every(([key]) => Number.isFinite(unit[key]))) return { state: 'pending' };
  const effects = entry.rules.filter((rule) => !rule.b && rule.t.includes(unit.id)).flatMap((rule) => toEffects(rule.fx));
  if (!stats.every(([key]) => effects.some((effect) => effect.s === key))) return { state: 'pending' };
  const base = baseStats(unit);
  const current = { ...base, bonus: { ...base.bonus }, armc: { ...base.armc } };
  applyEffects(current, effects);
  if (!stats.every(([key]) => Number.isFinite(current[key]))) return { state: 'pending' };
  return { state: 'ready', age: entry.age, tech: entry.tech, before: base, after: current };
}

export function ScoutAgeChanges({ unit }: { unit: Unit }) {
  const change = scoutAgeChange(unit);
  if (!change) return null;
  return (
    <DetailSection title="升时代自动变化">
      {change.state === 'pending' ? (
        <p>自动变化数据待确认</p>
      ) : (
        <>
          <p>
            {AGE_ZH[change.age - 1]}至{AGE_ZH[change.age]}：无需研究科技，进入该时代即生效。
          </p>
          <p className="note">仅列本表自动规则，不含文明加成和其它科技。</p>
          <StatTiles
            label="侦察骑兵自动属性"
            stats={stats.map(([key, label]) => {
              const delta = format(change.after[key] - change.before[key]);
              return {
                key,
                label,
                value: <span className="num nw">{format(change.after[key])}</span>,
                note: (
                  <>
                    {AGE_ZH[change.age - 1]}{' '}
                    <span className="num nw" data-auto-before>
                      {format(change.before[key])}
                    </span>
                    ；自动增加{' '}
                    <span className="num nw" data-auto-delta>
                      {delta > 0 ? '+' : ''}
                      {delta}
                    </span>
                  </>
                ),
              };
            })}
          />
          <p className="note">
            来源：DE <span className="num nw">{DATA_SOURCES.patch.build}</span>；基础属性与 effects.json generic 自动规则{' '}
            <span className="num nw">{change.tech}</span>。城堡／帝王的额外自动变化待确认。
          </p>
        </>
      )}
      <Link className="community-tool-entry" to="/about-data">
        数据说明
      </Link>
    </DetailSection>
  );
}
