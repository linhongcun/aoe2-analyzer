import { ListHead } from '../../../shared/ui/layout';
import { Link } from 'react-router-dom';
import { useCore } from '../../../data/hooks';
import { dlcMatch } from '../../../domain/dlc';
import { AGE_ZH } from '../../../domain/ratings';
import { CostView, DlcBadge, UnitIcon } from '../../../shared/ui/art';
import { DlcBar, DlcSelect, Loading, SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';

export default function UnitList() {
  const core = useCore();
  const [q, setQ] = useSticky('u.q', ''),
    [t, setT] = useSticky('u.t', ''),
    [a, setA] = useSticky('u.a', ''),
    [dlc, setDlc] = useSticky('u.dlc', '');
  const all = core?.units ?? [];
  const ql = q.toLowerCase();
  const r = all.filter((u) => (u.en.toLowerCase().includes(ql) || u.zh.includes(ql)) && (!t || u.type === t) && (!a || u.age === +a) && dlcMatch(u.dlc, dlc));
  return (
    <section id="units" className="pane">
      <ListHead title="单位" desc="全部单位 · 按类别、DLC、时代筛选" />
      <div className="bar fbar">
        <SearchInput id="uq" value={q} onChange={setQ} placeholder="搜索单位（中/英）" />
        <select id="ut" value={t} onChange={(e) => setT(e.target.value)}>
          <option value="">全部类别</option>
          <option value="UniqueUnit">独特单位</option>
          <option value="Unit">通用单位</option>
          <option value="UnitUpgrade">升级单位</option>
          <option value="RegionalUnit">区域单位</option>
        </select>
        <DlcSelect id="udlc" value={dlc} onChange={setDlc} />
        <select id="ua" value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">全部时代</option>
          <option value="1">黑暗</option>
          <option value="2">封建</option>
          <option value="3">城堡</option>
          <option value="4">帝王</option>
        </select>
        <span id="ucnt" className="note">
          {r.length} / {all.length}
        </span>
      </div>
      <DlcBar value={dlc} onChange={setDlc} />
      {!core ? (
        <Loading />
      ) : (
        <div id="ugrid">
          {r.map((u) => (
            <Link key={u.id} className="card ucard" to={`/unit/${u.id}`}>
              <UnitIcon u={u} />
              <div>
                <h3>{u.zh}</h3>
                <small>{u.en}</small>
                <div className="mini">
                  {u.bz} · {AGE_ZH[u.age] ?? ''} · <CostView c={u.cost} />
                </div>
                <DlcBadge i={u.dlc} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
