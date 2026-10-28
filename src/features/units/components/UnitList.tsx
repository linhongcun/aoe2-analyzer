import { ListHead } from '../../../shared/ui/layout';
import { Link } from 'react-router-dom';
import { useCore } from '../../../data/hooks';
import { AGE_ZH } from '../../../domain/ratings';
import { collapse } from '../../../domain/family';
import { filterUnitFamilies } from '../../../domain/unitFilters';
import { UNIT_ROLE_ZH, type UnitRole } from '../../../domain/unitRoles';
import { civNote, dupIdsIn } from '../../../domain/dupNames';
import { civByEn } from '../../../data';
import { CostView, DlcBadge, EliteBadge, UnitIcon } from '../../../shared/ui/art';
import { DlcBar, DlcSelect, Loading, SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { Icon } from '../../../shared/ui/Icon';
import { projectUnitDisplayAges } from '../displayAge';
import './unit-cards.css';

export default function UnitList() {
  const core = useCore();
  const [q, setQ] = useSticky('u.q', ''),
    [t, setT] = useSticky('u.t', ''),
    [a, setA] = useSticky('u.a', ''),
    [dlc, setDlc] = useSticky('u.dlc', ''),
    [civ, setCiv] = useSticky('u.civ', ''),
    [role, setRole] = useSticky<UnitRole | ''>('u.role', '');
  const all = core ? projectUnitDisplayAges(core.units, civ) : [];
  const fams = core ? collapse(all, core.fam) : [];
  const r = core ? filterUnitFamilies(all, core.fam, { query: q, type: t, age: a, dlc, civ, role }) : [];
  const dirty = Boolean(q || t || a || dlc || civ || role);
  const reset = () => {
    setQ('');
    setT('');
    setA('');
    setDlc('');
    setCiv('');
    setRole('');
  };
  // #44 同名单位同时出现在列表里时，主名后加文明小字
  const dup = dupIdsIn(r.map((x) => x.u));
  return (
    <section id="units" className="pane">
      <ListHead title="单位" desc="全部单位 · 按文明、兵种、类别、DLC、时代筛选" />
      <div className="bar fbar unit-list-filters">
        <SearchInput id="uq" value={q} onChange={setQ} placeholder="搜索单位（中/英）" />
        <CivPicker id="uciv" value={civ} onChange={setCiv} none="全部文明" label="可用文明" />
        <select id="urole" aria-label="兵种" value={role} onChange={(e) => setRole(e.target.value as UnitRole | '')}>
          <option value="">全部兵种</option>
          {(Object.keys(UNIT_ROLE_ZH) as UnitRole[]).map((key) => (
            <option key={key} value={key}>
              {UNIT_ROLE_ZH[key]}
            </option>
          ))}
        </select>
        <select id="ut" aria-label="单位类别" value={t} onChange={(e) => setT(e.target.value)}>
          <option value="">全部类别</option>
          <option value="UniqueUnit">独特单位</option>
          <option value="Unit">通用单位</option>
          <option value="UnitUpgrade">升级单位</option>
          <option value="RegionalUnit">区域单位</option>
        </select>
        <DlcSelect id="udlc" value={dlc} onChange={setDlc} />
        <select id="ua" aria-label="时代" value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">全部时代</option>
          <option value="1">黑暗</option>
          <option value="2">封建</option>
          <option value="3">城堡</option>
          <option value="4">帝王</option>
        </select>
        <div className="unit-filter-summary">
          <span id="ucnt" className="note" role="status" aria-live="polite">
            {r.length} / {fams.length}
          </span>
          {dirty && (
            <button type="button" onClick={reset}>
              清空筛选
            </button>
          )}
        </div>
      </div>
      <p className="note unit-filter-note">按当前版本科技树中的可用单位筛选，不计队友解锁。兵种可交叉归类，骑射也属于骑兵和弓兵；其他单位含村民、贸易车等。</p>
      <DlcBar value={dlc} onChange={setDlc} />
      {!core ? (
        <Loading />
      ) : !r.length ? (
        <div className="unit-filter-empty" role="status">
          <Icon name="search" />
          <h3>没有符合条件的单位</h3>
          <p className="note">试试减少文明、兵种或时代等条件。</p>
          <button type="button" onClick={reset}>
            清空筛选
          </button>
        </div>
      ) : (
        <div id="ugrid">
          {r.map(({ u, elite }) => (
            <Link key={u.id} className="card ucard" to={`/unit/${u.id}`} data-unit-id={u.id}>
              <UnitIcon u={u} />
              <div>
                <h3>
                  {u.zh}
                  {dup.has(u.id) && <span className="civnote">{civNote(u, (en) => civByEn(en)?.zh)}</span>}
                  {elite && <EliteBadge />}
                </h3>
                <small>{u.en}</small>
                <dl className="unit-card-stats" aria-label="基础属性">
                  <div data-stat="hp">
                    <dt>生命</dt>
                    <dd>{u.hp}</dd>
                  </div>
                  <div data-stat="atk">
                    <dt>攻击</dt>
                    <dd>{u.atk}</dd>
                  </div>
                  <div data-stat="rng">
                    <dt>射程</dt>
                    <dd>{u.rng}</dd>
                  </div>
                </dl>
                <div className="mini">
                  {u.bz} · {AGE_ZH[u.age] ?? ''} · <CostView c={u.cost} />
                </div>
                <DlcBadge i={u.dlc} linked={false} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
