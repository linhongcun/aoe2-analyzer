import { Link } from 'react-router-dom';
import { useCore } from '../../../data/hooks';
import type { Unit } from '../../../domain/types';
import { collapse } from '../../../domain/family';
import { CostView, EliteBadge, UnitIcon } from '../../../shared/ui/art';
import { ListHead } from '../../../shared/ui/layout';
import { Loading, SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';

/** 工具入口：选择单位后进入单位页“科技模拟器”标签 */
export default function SimulatorHub() {
  const core = useCore();
  const [q, setQ] = useSticky('simhub.q', '');
  const ql = q.toLowerCase();
  const m = (u?: Unit) => !!u && (u.zh.includes(ql) || u.en.toLowerCase().includes(ql));
  const list = (core ? collapse(core.units, core.fam) : []).filter((x) => x.u.civs.length && (m(x.u) || m(x.elite)));
  return (
    <section id="simhub" className="pane">
      <ListHead title="科技模拟器" desc="选择一个单位，再选择文明与科技，查看属性变化与累计研究费用" />
      <div className="bar fbar">
        <SearchInput id="sq" value={q} onChange={setQ} placeholder="搜索单位（中/英）" />
        <span className="note">{list.length} 个单位（精锐版在单位页内切换）</span>
      </div>
      {!core ? (
        <Loading />
      ) : (
        <div id="ugrid">
          {list.map(({ u, elite }) => (
            <Link key={u.id} className="card ucard" to={`/unit/${u.id}?tab=sim`}>
              <UnitIcon u={u} />
              <div>
                <h3>
                  {u.zh}
                  {elite && <EliteBadge />}
                </h3>
                <small>{u.en}</small>
                <div className="mini">
                  {u.bz} · <CostView c={u.cost} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
