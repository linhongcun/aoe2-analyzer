import type { BattleReplayModel, BattleReplaySnapshot } from '../../../domain/battleReplay';
import { formatHp } from '../../../domain/hpFormat';
import type { Unit } from '../../../domain/types';
import { UnitIcon } from '../../../shared/ui/art';

interface BattleReplaySidesProps {
  model: BattleReplayModel;
  snap: BattleReplaySnapshot;
  unitById: Record<number, Unit>;
}

function r1(v: number): string {
  return String(Math.round(v * 10) / 10);
}

export function BattleReplaySides({ model, snap, unitById }: BattleReplaySidesProps) {
  const sides = [
    {
      key: 'a' as const,
      label: 'A',
      meta: model.a,
      rows: snap.aRows,
      alive: snap.aAlive,
      hp: snap.aHp,
      active: snap.aActive,
    },
    {
      key: 'b' as const,
      label: 'B',
      meta: model.b,
      rows: snap.bRows,
      alive: snap.bAlive,
      hp: snap.bHp,
      active: snap.bActive,
    },
  ];

  return (
    <div className="br-sides">
      {sides.map(({ key, label, meta, rows, alive, hp, active }) => {
        const firstMeta = meta.rows[0]!;
        const firstRow = rows[0];
        const firstUnit = unitById[firstMeta.uid];
        const pct =
          model.kind === 'one'
            ? meta.totalMaxHp > 0
              ? Math.max(0, Math.min(100, (hp / meta.totalMaxHp) * 100))
              : 0
            : meta.totalInitial > 0
              ? Math.max(0, Math.min(100, (alive / meta.totalInitial) * 100))
              : 0;
        const waiting = Math.max(0, alive - active);

        return (
          <div key={key} className={`br-side-card is-${key}`}>
            <div className="br-side-head">
              <span className="br-side-title">
                <span className={`br-side-badge is-${key}`}>{label}</span>
                {model.kind !== 'mixed' && firstUnit && <UnitIcon u={firstUnit} />}
                <span>{model.kind === 'mixed' ? `${meta.civZh} 混编` : `${firstMeta.name}（${meta.civZh}）`}</span>
              </span>
              <span className="br-side-val num nw" data-t={`replay-${label}`}>
                {model.kind === 'one' ? `${formatHp(hp)} / ${formatHp(meta.totalMaxHp)} 生命` : `${alive} / ${meta.totalInitial} 个单位`}
              </span>
            </div>

            <div className="br-bar" aria-hidden="true">
              <div className={`br-bar-fill is-${key}`} style={{ width: `${pct}%` }} />
            </div>

            {model.kind === 'mixed' ? (
              <div className="br-mix-rows">
                {meta.rows.map((rm, idx) => {
                  const rs = rows[idx];
                  const rowAlive = rs?.alive ?? 0;
                  const rowActive = rs?.active ?? 0;
                  const rowCleared = rs?.cleared ?? rowAlive === 0;
                  const rowPct = rm.initial > 0 ? Math.max(0, Math.min(100, (rowAlive / rm.initial) * 100)) : 0;
                  const u = unitById[rm.uid];
                  return (
                    <div key={`${key}-${rm.uid}`} className={`br-mix-row${rowCleared ? ' is-cleared' : ''}`}>
                      <div className="br-mix-row-top">
                        <span className="br-mix-row-name">
                          <span className="br-row-idx num nw">{idx + 1}</span>
                          {u && <UnitIcon u={u} />}
                          <span>{rm.name}</span>
                        </span>
                        <span className="br-mix-row-meta num nw">
                          {rowCleared ? `0 / ${rm.initial} · 已清空` : `${rowAlive} / ${rm.initial}（活跃 ${rowActive}）`}
                        </span>
                      </div>
                      <div className="br-bar" aria-hidden="true">
                        <div className={`br-bar-fill is-${key}`} style={{ width: `${rowPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="br-facts">
                <span className="br-fact">
                  活跃出手 <span className="num nw">{active}</span>
                </span>
                {model.kind === 'group' && (
                  <span className="br-fact">
                    后排排队 <span className="num nw">{waiting}</span>
                  </span>
                )}
                {firstMeta.canFightAtMultipleDepths && !firstMeta.ranged && (firstRow?.ranks ?? 0) > 1 && (
                  <span className="br-fact">
                    <span className="num nw">{firstRow!.ranks} 排</span>同时出手
                  </span>
                )}
                {firstMeta.ranged && (
                  <span className={`br-fact${firstRow?.silencedByMinRange ? ' is-warn' : ''}`}>
                    {firstRow?.silencedByMinRange ? (
                      <>
                        停火（<span className="num nw">&lt; {formatHp(firstMeta.minRange)} 格</span>）
                      </>
                    ) : (
                      <>
                        射程 <span className="num nw">{r1(firstMeta.rng)} 格</span>
                      </>
                    )}
                  </span>
                )}
                {snap.openingSide === key && snap.openingVolley >= 1 && (
                  <span className="br-fact is-warn">
                    先手齐射 <span className="num nw">第 {snap.openingVolley} 轮</span>
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
