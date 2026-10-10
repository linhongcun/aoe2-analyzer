/** 全部文明加成：搜索 + 类别筛选 + 只看已计入数值 */
import { Link } from 'react-router-dom';
import { civs } from '../../../data';
import { allCivBonuses, BONUS_CATS } from '../../../domain/civBonus';
import { CivIcon } from '../../../shared/ui/art';
import { ListHead } from '../../../shared/ui/layout';
import { SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import { BonusTags } from './BonusBody';
import { civByEn } from '../../../data';

const ALL = allCivBonuses(civs);
export default function BonusList() {
  const [q, setQ] = useSticky('bon.q', ''),
    [cat, setCat] = useSticky('bon.cat', ''),
    [enc, setEnc] = useSticky('bon.enc', '');
  const ql = q.trim().toLowerCase();
  const r = ALL.filter(
    (b) =>
      (!ql || b.zh.includes(ql) || b.en.toLowerCase().includes(ql) || civByEn(b.civ)!.zh.includes(ql) || b.civ.toLowerCase().includes(ql)) &&
      (!cat || (cat === '团队' ? b.team : b.cats.includes(cat as never))) &&
      (!enc || b.encoded),
  );
  const nEnc = ALL.filter((b) => b.encoded).length;
  return (
    <section id="bonuses" className="pane">
      <ListHead title="文明加成" desc={`全部 ${ALL.length} 条文明/团队加成，其中 ${nEnc} 条已计入模拟器数值`} />
      <div className="bar fbar">
        <SearchInput id="bq" value={q} onChange={setQ} placeholder="搜索加成或文明（中/英）" />
        <label>
          <input id="benc" type="checkbox" checked={!!enc} onChange={(e) => setEnc(e.target.checked ? '1' : '')} /> 只看已计入数值
        </label>
        <span id="bcnt" className="note">
          {r.length} / {ALL.length}
        </span>
      </div>
      <div className="bar catbar" role="radiogroup" aria-label="类别">
        {['', ...BONUS_CATS, '团队'].map((c) => (
          <button key={c || 'all'} role="radio" aria-checked={cat === c} className={cat === c ? 'on' : undefined} onClick={() => setCat(c)}>
            {c || '全部'}
          </button>
        ))}
      </div>
      <ul id="blist" className="blist">
        {r.map((b) => (
          <li key={b.id}>
            <Link to={`/civ/${b.civ}/bonus/${b.idx}`}>
              <CivIcon c={{ en: b.civ }} />
              <span className="bl-main">
                <b>{civByEn(b.civ)!.zh}</b> {b.zh}
                <small className="note">{b.en}</small>
                <span className="bl-tags">
                  <BonusTags b={b} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
