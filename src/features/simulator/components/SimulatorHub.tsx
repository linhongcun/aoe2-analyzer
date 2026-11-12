import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { civByEn } from '../../../data';
import { useCore } from '../../../data/hooks';
import { AGE_ZH } from '../../../domain/ratings';
import { UNIT_ROLE_ZH, type UnitRole } from '../../../domain/unitRoles';
import type { Unit } from '../../../domain/types';
import { buildingName, simHref, simHubRows, simHubTotal } from '../hubList';
import { CostView, EliteBadge, UnitIcon, img } from '../../../shared/ui/art';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { Icon } from '../../../shared/ui/Icon';
import { ListHead } from '../../../shared/ui/layout';
import { Loading, SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import './simhub.css';

function productionText(unit: Unit): string {
  const age = AGE_ZH[unit.age] ?? '';
  const building = buildingName(unit.bz);
  return age ? `${building} · ${age}` : building;
}

/** 选一个单位，进入该单位详情里已有的科技模拟器。 */
export default function SimulatorHub() {
  const core = useCore();
  const [q, setQ] = useSticky('simhub.q', '');
  const [civ, setCiv] = useSticky('simhub.civ', '');
  const [role, setRole] = useSticky<UnitRole | ''>('simhub.role', '');
  const [age, setAge] = useSticky('simhub.age', '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusedInPanel = useRef(false);
  const total = core ? simHubTotal(core.units, core.fam) : [];
  const rows = core ? simHubRows(core.units, core.fam, { query: q, civ, role, age }) : [];
  const dirty = Boolean(q || civ || role || age);
  const summary = [q && `搜索“${q}”`, civ && civByEn(civ)?.zh, role && UNIT_ROLE_ZH[role], age && AGE_ZH[+age]].filter(Boolean).join(' · ');
  const reset = () => {
    setQ('');
    setCiv('');
    setRole('');
    setAge('');
    document.getElementById('sq')?.focus();
  };
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
    <section id="simhub" className="pane">
      <ListHead level={1} title="科技模拟器" desc="选择一个单位，再选择文明与科技，查看属性变化与累计研究费用" />
      {!core ? (
        <Loading />
      ) : (
        <>
          <div
            className="sim-filters"
            aria-label="筛选"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.defaultPrevented && filtersOpen && matchMedia('(max-width: 600px)').matches) {
                setFiltersOpen(false);
                toggle.current?.focus();
              }
            }}
          >
            <div className="sim-primary">
              <div className="sim-search">
                <SearchInput id="sq" value={q} onChange={setQ} placeholder="搜索单位（中文、英文、拼音或别名）" />
              </div>
              <CivPicker id="sciv" value={civ} onChange={setCiv} none="全部文明" label="可用文明" compactTrigger />
              <select
                id="srole"
                aria-label="兵种"
                className={role ? 'is-on' : undefined}
                value={role}
                onChange={(e) => setRole(e.target.value as UnitRole | '')}
              >
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
                className={`catalog-filter-toggle${age || filtersOpen ? ' is-on' : ''}`}
                aria-expanded={filtersOpen}
                aria-controls={panelId}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <Icon name="filter" /> 筛选{age ? '（1）' : ''}
              </button>
              <div className="sim-meta">
                <p className="sim-count nw">
                  <span id="scnt" className="num">
                    {rows.length} / {total.length}
                  </span>{' '}
                  个单位
                </p>
                {summary && <p className="catalog-filter-active">已选：{summary}</p>}
                {dirty && (
                  <button type="button" className="sim-reset" onClick={reset}>
                    清空筛选
                  </button>
                )}
              </div>
            </div>
            <div ref={panel} id={panelId} className="catalog-filter-panel" data-open={filtersOpen ? 'true' : 'false'}>
              <div className="sim-age">
                <div className="sim-age-label">时代</div>
                <div className="sim-chips" role="group" aria-label="时代快捷筛选">
                  <button type="button" data-v="" className={age === '' ? 'on' : undefined} aria-pressed={age === ''} onClick={() => setAge('')}>
                    全部
                  </button>
                  {([1, 2, 3, 4] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      data-v={String(value)}
                      className={age === String(value) ? 'on' : undefined}
                      aria-pressed={age === String(value)}
                      onClick={() => setAge(String(value))}
                    >
                      <img src={img(`ages/${value}.webp`)} alt="" />
                      {AGE_ZH[value]?.replace(/时代$/, '')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="sim-cost-basis">造价为目录基础值，不是该文明折后训练价。</p>
            <p className="sim-note">精锐形态在进入模拟后切换。</p>
            <p className="sim-note">文明可用性按当前版本科技树，不计队友解锁。</p>
            <details className="sim-help">
              <summary>
                兵种交叉说明 <Icon name="chevron-down" />
              </summary>
              <p>兵种按护甲类别划分，可以交叉。例如骑射同时属于骑兵和弓兵；战车、骆驼投石机等出现在骑兵中是同一规则。</p>
            </details>
          </div>
          {!rows.length ? (
            <div className="sim-empty" role="status">
              <Icon name="search" />
              <h2>没有符合条件的单位</h2>
              <p>试试减少搜索、文明、兵种或时代等条件。</p>
              {dirty && (
                <button type="button" onClick={reset}>
                  清空筛选
                </button>
              )}
            </div>
          ) : (
            <div className="sim-rows">
              <div className="sim-head" aria-hidden="true">
                <span>单位</span>
                <span>生产 / 时代</span>
                <span>造价</span>
                <span />
              </div>
              {rows.map(({ u, elite }) => (
                <Link key={u.id} className="sim-row" to={simHref(u.id, civ)} data-unit-id={u.id}>
                  <span className="sim-id">
                    <UnitIcon u={u} />
                    <span className="sim-names">
                      <span className="sim-zh">
                        {u.zh}
                        {elite && <EliteBadge />}
                      </span>
                      <span className="sim-en">{u.en}</span>
                    </span>
                  </span>
                  <span className="sim-mid">
                    <span className="sim-prod">{productionText(u)}</span>
                    <span className="sim-cost">
                      <CostView c={u.cost} />
                    </span>
                  </span>
                  <Icon name="chevron-right" className="sim-go" />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
