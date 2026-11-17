import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { civByEn, type Core } from '../../../data';
import { AGE_ZH } from '../../../domain/ratings';
import type { Trees } from '../../../domain/types';
import { BuildingIcon } from '../../../shared/ui/art';
import { unitGarrisonSummary, type UnitGarrisonHost } from '../garrisonSummary';

function GarrisonHost({ row }: { row: UnitGarrisonHost }) {
  const r = row.result;
  return (
    <li className="ud-garrison-row" data-host={row.building.id}>
      <div className="ud-garrison-host">
        <BuildingIcon b={row.building} />
        <div>
          <strong>{row.building.zh}</strong>
          <div className="ud-kicker">{row.age === null ? '时代待核实' : AGE_ZH[row.age]}</div>
        </div>
      </div>
      <div className="ud-garrison-summary">
        {!r ? (
          <span>待核实，暂无法生成有效预览。</span>
        ) : (
          <>
            <span className="nw">
              满容量 <span className="num nw">{r.rows[0]!.countValue} 名</span>
            </span>
            {r.totalProjectiles === null || r.extraProjectiles === null ? (
              <span>弹丸数待核实</span>
            ) : r.mode === 'arrows' ? (
              <>
                <span className="nw">
                  总{' '}
                  <span className="num nw" data-garrison-total>
                    {r.totalProjectiles} 箭
                  </span>
                </span>
                <span className="nw">
                  上限{' '}
                  <span className="num nw" data-garrison-max>
                    {r.maxProjectiles} 箭
                  </span>
                </span>
                <span className="nw" data-garrison-saturation>
                  {r.singleUnitSaturationAt === null ? (
                    '容量内无法达到'
                  ) : (
                    <>
                      <span className="num nw">{r.singleUnitSaturationAt} 名</span>达到上限
                    </>
                  )}
                </span>
                {r.extraProjectiles === 0 && <span>驻军不增加弹丸</span>}
              </>
            ) : (
              <span>{r.mode === 'cannon' && r.extraProjectiles === 0 ? '可驻军，驻军不增加弹丸' : '可驻军'}</span>
            )}
          </>
        )}
      </div>
      {row.href && (
        <Link className="ud-btn" to={row.href} aria-label={`查看${row.building.zh}驻军预览`}>
          查看驻军预览
        </Link>
      )}
    </li>
  );
}

export default function UnitGarrison({
  core,
  trees,
  unitId,
  civ,
  error,
  pending,
  retry,
}: {
  core: Core;
  trees: Trees | null;
  unitId: number;
  civ: string;
  error: boolean;
  pending: boolean;
  retry: () => void;
}) {
  const summary = useMemo(() => (trees ? unitGarrisonSummary({ core, trees }, unitId, civ) : null), [core, trees, unitId, civ]);
  const civName = civByEn(civ)?.zh ?? civ;
  const name = core.unitById[unitId]?.zh ?? '本单位';
  return (
    <section className="ud-section" id="unit-garrison" aria-labelledby="unit-garrison-title">
      <h2 id="unit-garrison-title">驻军</h2>
      {!civ ? (
        <p>选择文明后查看本单位的驻军结果。</p>
      ) : !summary ? (
        <div role={error ? 'alert' : 'status'}>
          <p>{error ? '科技树资料加载失败，目录资料仍可查看。' : '科技树资料加载中，目录资料仍可查看。'}</p>
          {error && (
            <button className="ud-btn" type="button" onClick={retry} disabled={pending}>
              {pending ? '正在重试…' : '重试科技树'}
            </button>
          )}
        </div>
      ) : summary.kind === 'unavailable' ? (
        <p>
          {civName}无法训练{name}，不提供该文明的驻军结果。
        </p>
      ) : summary.kind === 'hosts' ? (
        <>
          <p className="ud-kicker">按{civName}与各行所列时代计算，未选可选科技；含模型自动计入项。</p>
          {summary.rows.length ? (
            <>
              {summary.rows.some((r) => !r.result) && <p role="status">部分宿主待核实，列表尚不完整。</p>}
              <ul className="ud-garrison-list">
                {summary.rows.map((row) => (
                  <GarrisonHost key={row.building.id} row={row} />
                ))}
              </ul>
            </>
          ) : (
            <p>
              {name}在{civName}没有可从外部进入的驻军建筑。
            </p>
          )}
        </>
      ) : null}
      <p className="ud-kicker">理论弹丸数，尚未完成该版本客户端逐项对账，不代表齐射伤害或胜负。</p>
    </section>
  );
}
