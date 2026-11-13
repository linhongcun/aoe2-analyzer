import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { DLCS } from '../../../domain/dlc';
import { formatHp } from '../../../domain/hpFormat';
import { collapse } from '../../../domain/family';
import { civNote, dupIdsIn } from '../../../domain/dupNames';
import { AGE_ZH } from '../../../domain/ratings';
import { filterUnitFamilies } from '../../../domain/unitFilters';
import { UNIT_ROLE_ZH, type UnitRole } from '../../../domain/unitRoles';
import { CostView, UnitIcon, img } from '../../../shared/ui/art';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { Icon } from '../../../shared/ui/Icon';
import { ListHead } from '../../../shared/ui/layout';
import { Loading, SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import { formatCatalogStat } from '../catalogStat';
import { projectUnitDisplayAges } from '../displayAge';
import './unit-list.css';

const TYPES = [
  ['', '全部'],
  ['UniqueUnit', '独特单位'],
  ['Unit', '通用单位'],
  ['UnitUpgrade', '升级单位'],
  ['RegionalUnit', '区域单位'],
] as const;

const TYPE_ZH: Record<string, string> = { UniqueUnit: '独特单位', Unit: '通用单位', UnitUpgrade: '升级单位', RegionalUnit: '区域单位' };

const statClass = (value: number) => (value === 0 ? 'num nw is-zero' : 'num nw');

function unitHref(id: number, civ: string) {
  return civ ? `/unit/${id}?civ=${encodeURIComponent(civ)}` : `/unit/${id}`;
}

export default function UnitList() {
  const core = useCore();
  const [q, setQ] = useSticky('u.q', ''),
    [t, setT] = useSticky('u.t', ''),
    [a, setA] = useSticky('u.a', ''),
    [dlc, setDlc] = useSticky('u.dlc', ''),
    [civ, setCiv] = useSticky('u.civ', ''),
    [role, setRole] = useSticky<UnitRole | ''>('u.role', '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusedInPanel = useRef(false);
  const all = core ? projectUnitDisplayAges(core.units, civ) : [];
  const fams = core ? collapse(all, core.fam) : [];
  const r = core ? filterUnitFamilies(all, core.fam, { query: q, type: t, age: a, dlc, civ, role }) : [];
  const dirty = Boolean(q || t || a || dlc || civ || role);
  const secondaryCount = [t, a, dlc].filter(Boolean).length;
  const reset = () => {
    setQ('');
    setT('');
    setA('');
    setDlc('');
    setCiv('');
    setRole('');
  };
  const summary = [
    q && `搜索“${q}”`,
    civ && civByEn(civ)?.zh,
    role && UNIT_ROLE_ZH[role],
    t && TYPE_ZH[t],
    dlc && (dlc === 'none' ? '未标注' : DLCS[+dlc]?.zh),
    a && AGE_ZH[+a],
  ]
    .filter(Boolean)
    .join(' · ');
  const dup = dupIdsIn(r.map((x) => x.u));
  useEffect(() => {
    const media = matchMedia('(max-width: 600px)');
    const trackFocus = (event: FocusEvent) => {
      focusedInPanel.current = panel.current?.contains(event.target as Node) ?? false;
    };
    const change = () => {
      if (media.matches && !filtersOpen && (focusedInPanel.current || panel.current?.contains(document.activeElement))) toggle.current?.focus();
    };
    document.addEventListener('focusin', trackFocus);
    media.addEventListener('change', change);
    window.addEventListener('resize', change);
    return () => {
      document.removeEventListener('focusin', trackFocus);
      media.removeEventListener('change', change);
      window.removeEventListener('resize', change);
    };
  }, [filtersOpen]);
  return (
    <section id="units" className="pane">
      <ListHead level={1} title="单位" desc="查找单位并打开详情。" />
      <div
        className="unit-filters"
        aria-label="筛选"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented && filtersOpen && matchMedia('(max-width: 600px)').matches) {
            setFiltersOpen(false);
            toggle.current?.focus();
          }
        }}
      >
        <div className="unit-filter-card">
          <div className="unit-filters-primary">
            <div className="unit-search">
              <SearchInput id="uq" value={q} onChange={setQ} placeholder="搜索单位（中文、英文、拼音或别名）" describedBy="unit-search-hint" />
              <p className="unit-search-hint" id="unit-search-hint">
                可搜中文、英文、拼音或别名
              </p>
            </div>
            <CivPicker id="uciv" value={civ} onChange={setCiv} none="全部文明" label="可用文明" />
            <select id="urole" aria-label="兵种" className={role ? 'is-on' : undefined} value={role} onChange={(e) => setRole(e.target.value as UnitRole | '')}>
              <option value="">全部兵种</option>
              {(Object.keys(UNIT_ROLE_ZH) as UnitRole[]).map((key) => (
                <option key={key} value={key}>
                  {UNIT_ROLE_ZH[key]}
                </option>
              ))}
            </select>
            <button
              ref={toggle}
              type="button"
              className={`catalog-filter-toggle${secondaryCount || filtersOpen ? ' is-on' : ''}`}
              aria-expanded={filtersOpen}
              aria-controls={panelId}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Icon name="filter" /> 筛选{secondaryCount > 0 ? `（${secondaryCount}）` : ''}
            </button>
          </div>
          <div ref={panel} id={panelId} className="catalog-filter-panel unit-filters-secondary" data-open={filtersOpen ? 'true' : 'false'}>
            <div className="unit-filter-row">
              <div className="unit-filter-label">时代</div>
              <div className="unit-chips" role="group" aria-label="时代快捷筛选">
                <button type="button" data-v="" className={a === '' ? 'on' : undefined} aria-pressed={a === ''} onClick={() => setA('')}>
                  全部
                </button>
                {([1, 2, 3, 4] as const).map((age) => (
                  <button
                    key={age}
                    type="button"
                    data-v={String(age)}
                    className={a === String(age) ? 'on' : undefined}
                    aria-pressed={a === String(age)}
                    onClick={() => setA(String(age))}
                  >
                    <img src={img(`ages/${age}.webp`)} alt="" />
                    {AGE_ZH[age]?.replace(/时代$/, '')}
                  </button>
                ))}
              </div>
            </div>
            <div className="unit-filter-row">
              <div className="unit-filter-label">资料片</div>
              <select id="udlc" aria-label="资料片" className={dlc ? 'is-on' : undefined} value={dlc} onChange={(e) => setDlc(e.target.value)}>
                <option value="">全部</option>
                {DLCS.map((item, index) => (
                  <option key={item.en} value={String(index)}>
                    {item.zh}
                  </option>
                ))}
                <option value="none">未标注</option>
              </select>
            </div>
            <div className="unit-filter-row">
              <div className="unit-filter-label">类别</div>
              <div className="unit-chips" role="group" aria-label="单位类别">
                {TYPES.map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    data-v={value}
                    className={t === value ? 'on' : undefined}
                    aria-pressed={t === value}
                    onClick={() => setT(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="unit-filter-meta">
            <p className="unit-filter-note">文明可用性按当前版本科技树，不计队友解锁。</p>
            <details className="unit-help">
              <summary>
                <Icon name="circle-help" /> 兵种交叉说明 <Icon name="chevron-down" />
              </summary>
              <p>兵种按护甲类别划分，可以交叉。例如骑射同时属于骑兵和弓兵；战车、骆驼投石机等出现在骑兵中是同一规则。</p>
            </details>
          </div>
        </div>
        <div className="unit-result-bar">
          <div className="unit-result-meta">
            <p className="unit-count">
              <span id="ucnt">{`${r.length} / ${fams.length}`}</span> <span>个系列</span>
            </p>
            {summary && <p className="catalog-filter-active">已选：{summary}</p>}
            {dirty && (
              <button
                type="button"
                className="unit-reset"
                onClick={(event) => {
                  reset();
                  event.currentTarget.closest('.unit-filters')?.querySelector('input')?.focus();
                }}
              >
                清空筛选
              </button>
            )}
          </div>
          <p className="unit-basis">生命、攻击、近战护甲、远程护甲、射程和造价是目录基础值，不是满科技或折后结果。</p>
        </div>
      </div>
      {!core ? (
        <Loading />
      ) : !r.length ? (
        <div className="unit-filter-empty" role="status">
          <Icon name="search" />
          <h2>没有符合条件的单位</h2>
          <p>试试减少文明、兵种、时代或资料片等条件。</p>
          {dirty && (
            <button type="button" onClick={reset}>
              清空筛选
            </button>
          )}
        </div>
      ) : (
        <div id="ugrid">
          <div className="unit-head" aria-hidden="true">
            <span>单位</span>
            <span>生产 / 时代</span>
            <span>造价</span>
            <span className="unit-head-stat">生命</span>
            <span className="unit-head-stat">攻击</span>
            <span className="unit-head-stat">近战护甲</span>
            <span className="unit-head-stat">远程护甲</span>
            <span className="unit-head-stat">射程</span>
            <span />
          </div>
          {r.map(({ u, elite }) => (
            <Link key={u.id} className="unit-row" to={unitHref(u.id, civ)} data-unit-id={u.id}>
              <span className="unit-id">
                <UnitIcon u={u} />
                <span className="unit-names">
                  <span className="unit-zh">
                    {u.zh}
                    {dup.has(u.id) && <span className="civnote nw">{civNote(u, (en) => civByEn(en)?.zh)}</span>}
                    {elite && <span className="elite-mark">含精锐</span>}
                  </span>
                  <span className="unit-en">{u.en}</span>
                </span>
              </span>
              <span className="unit-mid">
                <span className="unit-meta mini">
                  {u.bz || '—'} ·{' '}
                  <span className="unit-age nw">
                    {AGE_ZH[u.age] && <img src={img(`ages/${u.age}.webp`)} alt="" />}
                    {AGE_ZH[u.age] ?? ''}
                  </span>
                </span>
                <span className="unit-dot" aria-hidden="true">
                  ·
                </span>
                <span className="unit-cost">
                  <CostView c={u.cost} />
                </span>
              </span>
              <dl className="unit-stats" aria-label="基础属性">
                <div data-stat="hp">
                  <dt className="stat-label">生命</dt>
                  <dd className="num nw">{formatHp(u.hp)}</dd>
                </div>
                <div data-stat="atk">
                  <dt className="stat-label">攻击</dt>
                  <dd className={statClass(u.atk)}>{u.atk}</dd>
                </div>
                <div data-stat="ma">
                  <dt className="stat-label">近战护甲</dt>
                  <dd className={statClass(u.ma)}>{formatCatalogStat(u.ma)}</dd>
                </div>
                <div data-stat="pa">
                  <dt className="stat-label">远程护甲</dt>
                  <dd className={statClass(u.pa)}>{formatCatalogStat(u.pa)}</dd>
                </div>
                <div data-stat="rng">
                  <dt className="stat-label">射程</dt>
                  <dd className={statClass(u.rng)}>{u.rng}</dd>
                </div>
              </dl>
              <Icon name="chevron-right" className="unit-go" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
