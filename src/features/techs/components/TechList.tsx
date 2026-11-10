import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCore } from '../../../data/hooks';
import { DLCS } from '../../../domain/dlc';
import { AGE_ZH } from '../../../domain/ratings';
import { CostView, TechIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { ListHead } from '../../../shared/ui/layout';
import { Loading, SearchInput } from '../../../shared/ui/widgets';
import { useSticky } from '../../../shared/utils/sticky';
import { filterTechList, techBuildingOptions, techCivLabel, techReleaseLabel, unlabeledTechCount, type TechListFilters } from './techQuery';
import './tech-list.css';

const SEARCH_LABEL = '搜索名称、拼音、效果或已收录别名';
const BASIS = '费用为目录基础值，未计入文明折扣。时代按目录字段精确匹配，不代表当前仍可研究。';
const TYPES = [
  ['', '全部'],
  ['UniqueTech', '独特科技'],
  ['Research', '通用科技'],
  ['RegionalTech', '区域科技'],
] as const;
const TYPE_ZH: Record<string, string> = { UniqueTech: '独特科技', Research: '通用科技', RegionalTech: '区域科技' };

function releaseSummary(value: string, unlabeled: number): string {
  if (value === 'update') return '免费更新';
  if (value === 'none') return `未标注（当前 ${unlabeled}）`;
  return DLCS[+value]?.zh ?? '';
}

export default function TechList() {
  const core = useCore();
  const [q, setQ] = useSticky('t.q', ''),
    [ty, setTy] = useSticky('t.t', ''),
    [a, setA] = useSticky('t.a', ''),
    [b, setB] = useSticky('t.b', ''),
    [dlc, setDlc] = useSticky('t.dlc', '');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusedInPanel = useRef(false);
  const all = core?.techs ?? [];
  const filters: TechListFilters = { query: q, type: ty, age: a, building: b, release: dlc };
  const shown = filterTechList(all, filters);
  const unlabeled = unlabeledTechCount(all);
  const buildings = techBuildingOptions(all);
  const dirty = Boolean(q.trim() || ty || a || b || dlc);
  const secondary = [a, b, dlc].filter(Boolean).length;
  const summary = [q.trim() && `搜索「${q.trim()}」`, ty && TYPE_ZH[ty], a && AGE_ZH[+a], b, dlc && releaseSummary(dlc, unlabeled)].filter(Boolean).join(' · ');
  const reset = () => {
    setQ('');
    setTy('');
    setA('');
    setB('');
    setDlc('');
    document.getElementById('tq')?.focus();
  };
  useEffect(() => {
    const media = matchMedia('(max-width: 720px)');
    const trackFocus = (event: FocusEvent) => {
      focusedInPanel.current = panel.current?.contains(event.target as Node) ?? false;
    };
    const change = () => {
      if (media.matches && !open && (focusedInPanel.current || panel.current?.contains(document.activeElement))) toggle.current?.focus();
    };
    document.addEventListener('focusin', trackFocus);
    media.addEventListener('change', change);
    window.addEventListener('resize', change);
    return () => {
      document.removeEventListener('focusin', trackFocus);
      media.removeEventListener('change', change);
      window.removeEventListener('resize', change);
    };
  }, [open]);
  return (
    <section id="techs" className="pane">
      <ListHead level={1} title="科技" desc="按名称、类别、时代、研究建筑或首发版本查找科技。" />
      <div
        className="tech-filters"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented && open && matchMedia('(max-width: 720px)').matches) {
            setOpen(false);
            toggle.current?.focus();
          }
        }}
      >
        <SearchInput id="tq" value={q} onChange={setQ} placeholder={SEARCH_LABEL} label={SEARCH_LABEL} />
        <div id="tt" className="tech-chips" role="group" aria-label="科技类别">
          {TYPES.map(([value, label]) => (
            <button
              key={label}
              type="button"
              data-v={value}
              className={ty === value ? 'on' : undefined}
              aria-pressed={ty === value}
              onClick={() => setTy(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="tech-meta">
          <p className="tech-count">
            <span id="tcnt" className="num nw" role="status" aria-live="polite">{`${shown.length} / ${all.length} 项科技`}</span>
          </p>
          {dirty && summary && <p className="catalog-filter-active">{summary}</p>}
          {dirty && (
            <button type="button" className="catalog-filter-reset" onClick={reset}>
              清空筛选
            </button>
          )}
        </div>
        <p className="tech-basis">{BASIS}</p>
        <button
          ref={toggle}
          type="button"
          className="catalog-filter-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="filter" /> 筛选{secondary > 0 ? `（${secondary}）` : ''} <Icon name="chevron-down" className="ic tech-chevron" />
        </button>
        <div ref={panel} id={panelId} className="catalog-filter-panel tech-secondary" data-open={open ? 'true' : 'false'}>
          <label className="tech-field">
            <span>时代</span>
            <select id="ta" value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">全部时代</option>
              {([1, 2, 3, 4] as const).map((age) => (
                <option key={age} value={age}>
                  {AGE_ZH[age]}
                </option>
              ))}
            </select>
          </label>
          <label className="tech-field">
            <span>研究建筑</span>
            <select id="tb" value={b} onChange={(e) => setB(e.target.value)}>
              <option value="">全部建筑</option>
              {buildings.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="tech-field">
            <span>首发版本</span>
            <select id="tdlc" value={dlc} onChange={(e) => setDlc(e.target.value)}>
              <option value="">全部</option>
              {DLCS.map((item, index) => (
                <option key={item.en} value={String(index)}>
                  {item.zh}
                </option>
              ))}
              <option value="update">免费更新</option>
              <option value="none">{`未标注（当前 ${unlabeled}）`}</option>
            </select>
          </label>
        </div>
      </div>
      {!core ? (
        <Loading />
      ) : !shown.length ? (
        <div className="tech-empty" role="status">
          <p>没有符合条件的科技。</p>
          <button type="button" onClick={reset}>
            清空筛选
          </button>
        </div>
      ) : (
        <div id="tgrid">
          <div className="tech-head">
            <span>科技</span>
            <span>研究建筑</span>
            <span>时代</span>
            <span>文明</span>
            <span>费用</span>
            <span>首发</span>
          </div>
          {shown.map((t) => {
            const civ = techCivLabel(t);
            const release = techReleaseLabel(t);
            return (
              <Link key={t.id} className="tech-row" to={`/tech/${t.id}`} data-tech-id={t.id}>
                <span className="tech-id">
                  <TechIcon t={t} />
                  <span className="tech-names">
                    <span className="tech-zh">{t.zh}</span>
                    <span className="tech-en">{t.en}</span>
                  </span>
                </span>
                <span className="tech-pair">
                  <span className="tech-bz">
                    <span className="tech-k">建筑</span>
                    {t.bz}
                  </span>
                  <span className="tech-age">
                    <span className="tech-k">时代</span>
                    {AGE_ZH[t.age] ?? ''}
                  </span>
                </span>
                <span className="tech-tail">
                  <span className="tech-civ">{civ}</span>
                  <span className="tech-release nw">{release}</span>
                </span>
                <span className="tech-cost">
                  <span className="tech-k">费用</span>
                  <CostView c={t.cost} />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
