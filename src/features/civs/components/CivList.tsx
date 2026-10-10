import { useNavigate } from 'react-router-dom';
import { civs } from '../../../data';
import { TYPE_ZH } from '../../../domain/ratings';
import type { CivType } from '../../../domain/types';
import { CivIcon, DlcBadge } from '../../../shared/ui/art';
import { DlcBar, DlcSelect, SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import { filterCivs } from '../logic/filter';

export default function CivList() {
  const nav = useNavigate();
  const [q, setQ] = useSticky('civ.q', ''),
    [ty, setTy] = useSticky('civ.ty', ''),
    [pos, setPos] = useSticky('civ.pos', ''),
    [dlc, setDlc] = useSticky('civ.dlc', '');
  const r = filterCivs(civs, { q, ty, pos, dlc });
  return (
    <section id="list" className="pane">
      <div className="bar">
        <SearchInput id="q" value={q} onChange={setQ} placeholder="搜索文明（中/英）" />
        <select id="ty" value={ty} onChange={(e) => setTy(e.target.value)}>
          <option value="">全部类型</option>
          {(['cav', 'arch', 'inf', 'naval', 'monk', 'siege', 'def'] as CivType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_ZH[t]}
            </option>
          ))}
        </select>
        <DlcSelect id="cdlc" value={dlc} onChange={setDlc} />
        <select id="pos" value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="">全部位置</option>
          <option value="fl">适合边位 Flank (7分及以上)</option>
          <option value="pk">适合口袋 Pocket (7分及以上)</option>
        </select>
        <span id="cnt" className="note">
          {r.length} / {civs.length}
        </span>
      </div>
      <DlcBar value={dlc} onChange={setDlc} />
      <div id="grid">
        {r.length ? (
          r.map((c) => (
            <div className="card" key={c.en} onClick={() => nav('/civ/' + c.en)}>
              <CivIcon c={c} />
              <span className="cdl">
                <DlcBadge i={c.dlc} />
              </span>
              <h3>{c.zh}</h3>
              <small>{c.en}</small>
              <div>
                {c.ty.map((t) => (
                  <span key={t} className="tag">
                    {TYPE_ZH[t]}
                  </span>
                ))}
              </div>
              <div className="mini">
                边位 {c.fl} · 口袋 {c.pk}
              </div>
            </div>
          ))
        ) : (
          <p>无匹配文明</p>
        )}
      </div>
    </section>
  );
}
