import { Link } from 'react-router-dom';
import { useCore } from '../../../data/hooks';
import { BUILDING_TYPE_ZH } from '../../../domain/buildings';
import { AGE_ZH } from '../../../domain/ratings';
import type { BuildingType } from '../../../domain/types';
import { BuildingIcon, CostView, DlcBadge } from '../../../shared/ui/art';
import { ListHead } from '../../../shared/ui/layout';
import { DlcBar, DlcSelect, Loading, SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import { filterBuildings } from '../logic/filter';

export default function BuildingList() {
  const core = useCore();
  const [q, setQ] = useSticky('b.q', ''),
    [age, setAge] = useSticky('b.a', ''),
    [type, setType] = useSticky('b.t', ''),
    [dlc, setDlc] = useSticky('b.dlc', '');
  const all = core?.buildings ?? [];
  const r = filterBuildings(all, { q, age, type, dlc });
  return (
    <section id="buildings" className="pane">
      <ListHead title="建筑" desc="全部建筑 · 按时代、类型、DLC 筛选" />
      <div className="bar fbar">
        <SearchInput id="bq" value={q} onChange={setQ} placeholder="搜索建筑（中/英）" />
        <select id="bt" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部类型</option>
          {(Object.keys(BUILDING_TYPE_ZH) as BuildingType[]).map((t) => (
            <option key={t} value={t}>
              {BUILDING_TYPE_ZH[t]}
            </option>
          ))}
        </select>
        <select id="ba" value={age} onChange={(e) => setAge(e.target.value)}>
          <option value="">全部时代</option>
          <option value="1">黑暗</option>
          <option value="2">封建</option>
          <option value="3">城堡</option>
          <option value="4">帝王</option>
        </select>
        <DlcSelect id="bdlc" value={dlc} onChange={setDlc} />
        <span id="bcnt" className="note">
          {r.length} / {all.length}
        </span>
      </div>
      <DlcBar value={dlc} onChange={setDlc} />
      {!core ? (
        <Loading />
      ) : (
        <div id="bgrid">
          {r.map((b) => (
            <Link key={b.id} className="card ucard" to={`/building/${b.id}`}>
              <BuildingIcon b={b} />
              <div>
                <h3>{b.zh}</h3>
                <small>{b.en}</small>
                <div className="mini">
                  {BUILDING_TYPE_ZH[b.type]} · {AGE_ZH[b.age] ?? ''} · <CostView c={b.cost} />
                  {b.civs.length < 10 ? ' · ' + b.civs.length + ' 个文明' : ''}
                </div>
                <DlcBadge i={b.dlc} linked={false} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
