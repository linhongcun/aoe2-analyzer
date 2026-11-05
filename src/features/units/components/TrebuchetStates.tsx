import { Link } from 'react-router-dom';
import type { Unit } from '../../../domain/types';
import { DetailSection } from '../../../shared/ui/DetailBlocks';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';

/** 仅投影已核同的攻击字段，不把331目录记录改成42或新增切换模型。 */
export function TrebuchetStates({ unit }: { unit: Unit }) {
  if (unit.id !== 331) return null;
  const packed = [
    { label: '移动速度', value: unit.spd },
    { label: '近战护甲', value: unit.ma },
    { label: '穿刺护甲', value: unit.pa },
  ];
  const unpacked = [
    { label: '攻击力', value: unit.atk },
    { label: '射程', value: unit.rng },
    { label: '最小射程', value: unit.minr },
    { label: '攻击间隔', value: `${unit.rof}s` },
  ];
  const source = DATA_SOURCES.sources.dat!;
  return (
    <DetailSection title="打包与展开">
      <div className="two">
        <div>
          <h3>打包态</h3>
          <p>可移动，不能攻击</p>
          <dl className="detail-cost-grid">
            {packed.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <span className="num nw">{value}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3>展开态</h3>
          <p>可攻击，固定位置</p>
          <dl className="detail-cost-grid">
            {unpacked.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <span className="num nw">{value}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p>展开／打包耗时：待确认</p>
      <p className="note">生产时间是训练单位的用时，与打包／展开耗时不同；展开态护甲与准确度尚未收录。</p>
      <p className="note">
        来源：DE <span className="num nw">{DATA_SOURCES.patch.build}</span>。目录打包记录与固定DAT展开记录逐字段核对；这里只列已核实的状态属性。
      </p>
      <a className="community-tool-entry" href={`https://github.com/${source.repo}/blob/${source.commit}/${source.path}`} target="_blank" rel="noreferrer">
        固定 DE DAT
      </a>{' '}
      <Link className="community-tool-entry" to="/about-data">
        数据说明
      </Link>
    </DetailSection>
  );
}
