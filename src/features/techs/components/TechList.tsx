import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { dlcMatch } from '../../../domain/dlc';
import { AGE_ZH } from '../../../domain/ratings';
import { CostView, DlcBadge, TechIcon } from '../../../shared/ui/art';
import { DlcBar, DlcSelect, Loading, SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';

export default function TechList() {
  const core = useCore();
  const [q, setQ] = useSticky('t.q', ''),
    [ty, setTy] = useSticky('t.t', ''),
    [a, setA] = useSticky('t.a', ''),
    [b, setB] = useSticky('t.b', ''),
    [dlc, setDlc] = useSticky('t.dlc', '');
  const all = core?.techs ?? [];
  const ql = q.toLowerCase();
  const r = all.filter(
    (t) =>
      (t.en.toLowerCase().includes(ql) || t.zh.includes(ql) || t.desc.includes(ql)) &&
      (!ty || t.type === ty) &&
      (!a || t.age === +a) &&
      (!b || t.bz === b) &&
      dlcMatch(t.dlc, dlc),
  );
  return (
    <section id="techs" className="pane">
      <div className="bar">
        <SearchInput id="tq" value={q} onChange={setQ} placeholder="搜索科技（名称/效果）" />
        <select id="tt" value={ty} onChange={(e) => setTy(e.target.value)}>
          <option value="">全部类别</option>
          <option value="UniqueTech">独特科技</option>
          <option value="Research">通用科技</option>
          <option value="RegionalTech">区域科技</option>
        </select>
        <select id="ta" value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">全部时代</option>
          <option value="1">黑暗</option>
          <option value="2">封建</option>
          <option value="3">城堡</option>
          <option value="4">帝王</option>
        </select>
        <DlcSelect id="tdlc" value={dlc} onChange={setDlc} />
        <select id="tb" value={b} onChange={(e) => setB(e.target.value)}>
          <option value="">全部建筑</option>
          {[...new Set(all.map((t) => t.bz))].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <span id="tcnt" className="note">
          {r.length} / {all.length}
        </span>
      </div>
      <DlcBar value={dlc} onChange={setDlc} />
      {!core ? (
        <Loading />
      ) : (
        <div id="tgrid">
          {r.map((t) => (
            <Link key={t.id} className="card ucard" to={`/tech/${t.id}`}>
              <TechIcon t={t} />
              <div>
                <h3>{t.zh}</h3>
                <small>{t.en}</small>
                <div className="mini">
                  {t.bz} · {AGE_ZH[t.age] ?? ''} · <CostView c={t.cost} />
                  {t.type === 'UniqueTech' ? ' · ' + t.civs.map((n) => civByEn(n)?.zh).join('/') : ''}
                </div>
                <DlcBadge i={t.dlc} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
