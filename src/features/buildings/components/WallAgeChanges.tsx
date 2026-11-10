import { Link } from 'react-router-dom';
import { buildingBase } from '../../../domain/buildingSim';
import { DAT, toEffects, type DatGeneric } from '../../../domain/datEffects';
import { AGE_ZH } from '../../../domain/ratings';
import { formatHp } from '../../../domain/hpFormat';
import { applyEffects } from '../../../domain/simulator';
import type { Building } from '../../../domain/types';
import { DetailSection, StatTiles } from '../../../shared/ui/DetailBlocks';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';

const sources: Record<number, number> = { 72: 72, 792: 72, 117: 71, 487: 71 };

export function wallAgeChange(
  building: Building,
  source: readonly DatGeneric[] = DAT.generic,
): { state: 'ready'; age: number; tech: number; before: number; after: number; multiplier: number } | { state: 'pending' } | null {
  const tech = sources[building.id];
  if (tech === undefined) return null;
  const entries = source.filter((entry) => entry.tech === tech && entry.any === false && entry.req.length === 0);
  const entry = entries[0];
  if (entries.length !== 1 || !entry || ![2, 3, 4].includes(entry.age) || !Number.isFinite(building.hp)) return { state: 'pending' };
  const raw = entry.rules
    .filter((rule) => rule.b === 1 && rule.t.includes(building.id))
    .flatMap((rule) => rule.fx)
    .filter((effect) => effect.s === 'hp');
  const effect = raw[0];
  if (raw.length !== 1 || !effect || effect.op !== 'mul' || !Number.isFinite(effect.v)) return { state: 'pending' };
  const current = buildingBase(building);
  applyEffects(current, toEffects(raw));
  const after = current.hp;
  if (!Number.isFinite(after)) return { state: 'pending' };
  return { state: 'ready', age: entry.age, tech, before: building.hp, after, multiplier: effect.v };
}

export function WallAgeChanges({ building }: { building: Building }) {
  const change = wallAgeChange(building);
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
            label="墙门自动生命值"
            stats={[
              {
                key: 'hp',
                label: '生命值',
                value: <span className="num nw">{formatHp(change.after)}</span>,
                note: (
                  <>
                    {AGE_ZH[change.age - 1]}{' '}
                    <span className="num nw" data-auto-before>
                      {formatHp(change.before)}
                    </span>
                    ；自动变化{' '}
                    <span className="num nw">
                      {change.after > change.before ? '+' : ''}
                      {formatHp(change.after - change.before)}
                    </span>
                  </>
                ),
              },
            ]}
          />
          <p>
            原始生命倍率{' '}
            <span className="num nw" data-auto-multiplier>
              ×{change.multiplier}
            </span>
            ，按现有建筑规则计算后取整。
          </p>
          <p className="note">
            来源：DE <span className="num nw">{DATA_SOURCES.patch.build}</span>；基础属性与 effects.json generic 自动规则{' '}
            <span className="num nw">{change.tech}</span>。
          </p>
        </>
      )}
      <Link className="community-tool-entry" to="/about-data">
        数据说明
      </Link>
    </DetailSection>
  );
}
