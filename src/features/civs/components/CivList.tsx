import { ListHead } from '../../../shared/ui/layout';
import { useNavigate } from 'react-router-dom';
import { civs } from '../../../data';
import { TYPE_ZH } from '../../../domain/ratings';
import type { CivType } from '../../../domain/types';
import { CivIcon, DlcBadge } from '../../../shared/ui/art';
import { DlcSelect, SearchInput } from '../../../shared/ui/widgets';
import CatalogFilters from '../../../shared/ui/CatalogFilters';
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
      <ListHead title="文明" desc="56 个文明 · 按类型、DLC、团战位置筛选" />
      <CatalogFilters
        search={<SearchInput id="q" value={q} onChange={setQ} placeholder="搜索文明（中/英）" />}
        count={
          <span id="cnt">
            {r.length} / {civs.length}
          </span>
        }
        active={[ty, pos, dlc].filter(Boolean).length}
        dirty={Boolean(q || ty || pos || dlc)}
        onReset={() => {
          setQ('');
          setTy('');
          setPos('');
          setDlc('');
        }}
      >
        <select id="ty" aria-label="文明类型" value={ty} onChange={(e) => setTy(e.target.value)}>
          <option value="">全部类型</option>
          {(['cav', 'arch', 'inf', 'naval', 'monk', 'siege', 'def'] as CivType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_ZH[t]}
            </option>
          ))}
        </select>
        <DlcSelect id="cdlc" value={dlc} onChange={setDlc} />
        <select id="pos" aria-label="团战位置" value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="">全部位置</option>
          <option value="fl">适合边位 Flank (7分及以上)</option>
          <option value="pk">适合口袋 Pocket (7分及以上)</option>
        </select>
      </CatalogFilters>
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
