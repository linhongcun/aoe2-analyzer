import { Link } from 'react-router-dom';
import { regionalUnitLines } from '../../../domain/civUnits';
import { AGE_ZH } from '../../../domain/ratings';
import { unitPath } from '../../../domain/simRoute';
import type { Unit } from '../../../domain/types';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import { UnitIcon } from '../../../shared/ui/art';
import './civ-regional-units.css';

export function CivRegionalUnits({ civ, units }: { civ: string; units: readonly Unit[] | null }) {
  const lines = units ? regionalUnitLines(civ, units) : [];
  return (
    <DetailSection title="区域单位" className="civ-regional-units">
      <p className="note">部分文明拥有的区域兵种，也是本文明的部队选择。点击单位可查看数据，并按本文明模拟科技与加成。</p>
      {!units ? (
        <p role="status">正在加载区域单位…</p>
      ) : lines.length ? (
        <>
          <ul>
            {lines.map((line) => (
              <li key={line[0]!.id}>
                <div className="uchips">
                  {line.map((u) => (
                    <span className="civ-regional-form" key={u.id}>
                      <Link className="ulink" to={unitPath(u.id, civ, u.age, [], [])}>
                        <UnitIcon u={u} />
                        {u.zh}
                      </Link>
                      <small className="note nw">{AGE_ZH[u.age]}</small>
                    </span>
                  ))}
                </div>
                <p className="note">训练建筑：{[...new Set(line.map((u) => u.bz))].join('、')}</p>
              </li>
            ))}
          </ul>
          <p className="note">时代表示科技树中的最早开放时代；实战仍需满足建筑与升级前置。</p>
        </>
      ) : (
        <p>本文明没有区域单位。</p>
      )}
    </DetailSection>
  );
}
