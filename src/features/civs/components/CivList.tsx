import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { civs } from '../../../data';
import { useCore, useTrees } from '../../../data/hooks';
import { DLCS } from '../../../domain/dlc';
import { TYPE_ZH } from '../../../domain/ratings';
import type { CivType } from '../../../domain/types';
import {
  EMPTY_CIV_FILTERS,
  readCivRequirements,
  resolveRequirements,
  searchRequirements,
  type RequirementCondition,
  type RequirementRef,
} from '../../../domain/civRequirements';
import { CivIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { ListHead } from '../../../shared/ui/layout';
import {
  browseCivs,
  normalizeBrowseFilters,
  requirementKindLabel,
  requirementToken,
  suggestedRequirements,
  typeLabel,
  uniqueUnitLabel,
  writeBrowseQuery,
  type BrowseFilters,
} from '../logic/browse';
import './civ-browse.css';
import './civ-list-links.css';

const TYPE_OPTIONS = Object.keys(TYPE_ZH) as CivType[];

export default function CivList() {
  const [params, setParams] = useSearchParams();
  const core = useCore();
  const trees = useTrees();
  const read = readCivRequirements(params, EMPTY_CIV_FILTERS);
  const filters = normalizeBrowseFilters({ q: read.filters.q, ty: read.filters.ty, dlc: read.filters.dlc });
  const conditions = read.conditions;
  const context = core && trees ? { units: core.units, techs: core.techs, trees } : null;
  const result = browseCivs(civs, filters, conditions, context);
  const [optionQuery, setOptionQuery] = useState('');
  const [panel, setPanel] = useState<'filter' | 'detail' | null>(null);
  const [detailEn, setDetailEn] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef(panel);
  const detailEnRef = useRef(detailEn);
  const active = Boolean(filters.q.trim() || filters.ty || filters.dlc || conditions.length);
  const resolved = context ? resolveRequirements(conditions, context) : [];
  const selected = new Set(conditions.map((item) => item.token));
  const detail = detailEn ? civs.find((civ) => civ.en === detailEn) : undefined;
  const optionTrim = optionQuery.trim();
  const optionMatches = context && optionTrim ? searchRequirements(context, optionTrim, 'all') : [];
  const options = !context ? [] : optionTrim ? optionMatches.slice(0, 14) : suggestedRequirements(context);
  const optionTotal = optionMatches.length;

  const commit = (nextFilters: BrowseFilters, nextConditions: RequirementCondition[]) => {
    setParams(writeBrowseQuery(params, nextFilters, nextConditions), { replace: true });
  };
  const changeFilters = (partial: Partial<BrowseFilters>) => commit({ ...filters, ...partial }, conditions);
  const removeCondition = (index: number) =>
    commit(
      filters,
      conditions.filter((_, itemIndex) => itemIndex !== index),
    );
  const toggleRequirement = (ref: RequirementRef) => {
    const token = requirementToken(ref);
    const next = conditions.some((item) => item.token === token) ? conditions.filter((item) => item.token !== token) : [...conditions, { token, ref }];
    commit(filters, next);
  };
  const reset = () => {
    setOptionQuery('');
    commit({ q: '', ty: '', dlc: '' }, []);
  };
  const closePanel = () => {
    const restore = panel === 'detail' ? detailEn : null;
    setPanel(null);
    requestAnimationFrame(() => {
      if (restore) document.querySelector<HTMLButtonElement>(`#grid .card[data-civ="${CSS.escape(restore)}"]`)?.focus();
      else toggleRef.current?.focus();
    });
  };

  useEffect(() => {
    panelRef.current = panel;
    detailEnRef.current = detailEn;
  }, [panel, detailEn]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panelRef.current) {
        event.preventDefault();
        const restore = panelRef.current === 'detail' ? detailEnRef.current : null;
        setPanel(null);
        requestAnimationFrame(() => {
          if (restore) document.querySelector<HTMLButtonElement>(`#grid .card[data-civ="${CSS.escape(restore)}"]`)?.focus();
          else toggleRef.current?.focus();
        });
        return;
      }
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section id="list" className="pane">
      <div className="civ-head">
        <div className="civ-title">
          <ListHead level={1} title="文明" desc="直接查找，或按所需单位与科技缩小范围。" />
        </div>
        <div className="civ-search">
          <label className="civ-sr" htmlFor="q">
            搜索文明
          </label>
          <Icon name="search" />
          <input
            ref={searchRef}
            id="q"
            type="search"
            value={filters.q}
            placeholder="搜索文明，中英文或拼音"
            autoComplete="off"
            onChange={(event) => changeFilters({ q: event.target.value })}
          />
          <kbd aria-hidden="true">/</kbd>
        </div>
      </div>
      <div className="civ-toolbar">
        <p className="civ-result-title">
          文明{' '}
          <span id="cnt" className="num nw">
            {result.loading ? '加载中' : `${result.civs.length} / ${civs.length}`}
          </span>
        </p>
        <span className="civ-scope">{active ? '条件已生效' : '全部文明，未设置条件'}</span>
        <div className="civ-toolbar-actions">
          <button
            ref={toggleRef}
            type="button"
            className="civ-filter-toggle"
            aria-expanded={panel === 'filter'}
            aria-controls="filter-panel"
            onClick={() => setPanel((current) => (current === 'filter' ? null : 'filter'))}
          >
            <Icon name="filter" />
            按条件筛选
          </button>
          {active && (
            <button type="button" className="civ-reset" onClick={reset}>
              重置全部
            </button>
          )}
        </div>
      </div>
      <div className="civ-summary" aria-label="当前生效条件">
        {filters.q.trim() && (
          <span className="civ-chip">
            名称：{filters.q.trim()}
            <button type="button" aria-label={`移除名称 ${filters.q.trim()}`} onClick={() => changeFilters({ q: '' })}>
              移除
            </button>
          </span>
        )}
        {filters.ty && (
          <span className="civ-chip">
            类型：{typeLabel(filters.ty)}
            <button type="button" aria-label={`移除类型 ${typeLabel(filters.ty)}`} onClick={() => changeFilters({ ty: '' })}>
              移除
            </button>
          </span>
        )}
        {filters.dlc && (
          <span className="civ-chip">
            DLC：{DLCS[Number(filters.dlc)]?.zh}
            <button type="button" aria-label={`移除 DLC ${DLCS[Number(filters.dlc)]?.zh ?? ''}`} onClick={() => changeFilters({ dlc: '' })}>
              移除
            </button>
          </span>
        )}
        {(context ? resolved : conditions.map((condition) => ({ ...condition, entity: null, error: null }))).map((condition, index) => (
          <span className={`civ-chip${condition.error ? ' invalid' : ''}`} key={`${condition.token}-${index}`} data-testid="requirement-chip">
            {condition.error ? (
              <span data-testid="requirement-invalid">
                <b>无效条件：{condition.token || '空条件'}</b>
                <small>{condition.error}</small>
              </span>
            ) : condition.entity && condition.ref ? (
              <>
                <span>{requirementKindLabel(condition.ref.kind)}</span>
                <Link to={`/${condition.ref.kind}/${condition.ref.id}`}>{condition.entity.zh}</Link>
              </>
            ) : (
              <span>{condition.token || '条件'}</span>
            )}
            <button
              type="button"
              aria-label={
                condition.error
                  ? `移除无效条件 ${condition.token || '空条件'}`
                  : condition.entity && condition.ref
                    ? `移除${requirementKindLabel(condition.ref.kind)} ${condition.entity.zh}`
                    : `移除条件 ${condition.token || '空条件'}`
              }
              onClick={() => removeCondition(index)}
            >
              移除
            </button>
          </span>
        ))}
      </div>
      {result.blocked && (
        <p className="requirements-blocked" data-testid="requirements-blocked" role="alert">
          组合含无效条件，暂不显示文明。请移除上方无效项目或重置全部后再查询。
        </p>
      )}
      <div className="civ-layout">
        <section className="civ-results" aria-label="文明结果">
          {result.loading ? (
            <p className="note" data-testid="requirements-loading" role="status">
              正在核对科技树可用性，请稍候。
            </p>
          ) : result.blocked ? null : result.civs.length ? (
            <div id="grid">
              {result.civs.map((civ) => (
                <button
                  key={civ.en}
                  type="button"
                  className="card"
                  data-civ={civ.en}
                  aria-pressed={panel === 'detail' && detailEn === civ.en}
                  onClick={() => {
                    setDetailEn(civ.en);
                    setPanel('detail');
                  }}
                >
                  <span className="civ-card-head">
                    <CivIcon c={civ} alt="" />
                    <span className="civ-names">
                      <span className="civ-zh">{civ.zh}</span>
                      <small className="civ-en">{civ.en}</small>
                    </span>
                  </span>
                  <span className="civ-type">{civ.desc}</span>
                  <span className="civ-unique">
                    <span className="civ-unique-label">独特单位</span>
                    <span className="civ-uu" data-testid="civ-unique">
                      {uniqueUnitLabel(civ.uu)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="civ-empty">
              <strong>没有符合条件的文明</strong>
              <p>移除上方某个条件，或重置后重新查找。</p>
            </div>
          )}
          <p className="civ-hint">点选文明可就地查看加成，或进入完整资料；英文名辅助识别，不显示无依据的评分。</p>
        </section>
        <aside id="filter-panel" className="civ-panel" hidden={panel !== 'filter'} aria-label="筛选文明">
          <div className="civ-panel-head">
            <h2>筛选文明</h2>
            <button type="button" onClick={closePanel}>
              收起
            </button>
          </div>
          <div className="civ-field">
            <label className="civ-field-label" htmlFor="ty">
              文明类型
            </label>
            <select id="ty" value={filters.ty} onChange={(event) => changeFilters({ ty: event.target.value })}>
              <option value="">不限类型</option>
              {TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {TYPE_ZH[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="civ-field">
            <label className="civ-field-label" htmlFor="dlc">
              所属版本 / DLC
            </label>
            <select id="dlc" value={filters.dlc} onChange={(event) => changeFilters({ dlc: event.target.value })}>
              <option value="">不限版本 / DLC</option>
              {DLCS.map((dlc, index) => (
                <option key={dlc.en} value={String(index)}>
                  {dlc.zh}
                </option>
              ))}
            </select>
            <p className="civ-help">按文明首发版本分类，不代表账号已拥有的内容。</p>
          </div>
          <div className="civ-field">
            <label className="civ-field-label" htmlFor="option-search">
              查找要添加的单位与科技
            </label>
            <input
              id="option-search"
              type="search"
              value={optionQuery}
              placeholder="搜索，如骑士"
              autoComplete="off"
              disabled={!context}
              onChange={(event) => setOptionQuery(event.target.value)}
            />
            <p className="civ-help">此处搜索词只查找候选，不是生效条件。勾选后立即更新结果。</p>
            {!context ? (
              <p className="civ-help" role="status">
                正在加载单位与科技…
              </p>
            ) : (
              <div className="civ-options">
                {options.map(({ ref, entity }) => {
                  const token = requirementToken(ref);
                  const kind = requirementKindLabel(ref.kind);
                  const on = selected.has(token);
                  return (
                    <label className="civ-option" key={token}>
                      <input type="checkbox" checked={on} aria-label={`${on ? '移除' : '添加'}${kind} ${entity.zh}`} onChange={() => toggleRequirement(ref)} />
                      <span>{entity.zh}</span>
                      <small>{kind}</small>
                    </label>
                  );
                })}
                {optionTrim && !options.length && <p className="civ-help">没有匹配的单位或科技</p>}
                {optionTrim && optionTotal > options.length && <p className="civ-help">继续输入可缩小候选范围</p>}
                {!optionTrim && <p className="civ-help">支持搜索 {context.units.length + context.techs.length} 项单位与科技</p>}
              </div>
            )}
          </div>
          <p className="civ-notice">按本项目现有科技树的可用性筛选，不自动补齐升级前置科技，也不代表实战强度。</p>
        </aside>
        <aside id="civ-preview" className="civ-panel civ-preview" hidden={panel !== 'detail' || !detail} aria-label="文明速览">
          {detail && (
            <>
              <div className="civ-panel-head">
                <h2>文明速览</h2>
                <button type="button" onClick={closePanel}>
                  关闭
                </button>
              </div>
              <div className="civ-preview-id">
                <span className="civ-preview-crest">
                  <CivIcon c={detail} alt="" />
                </span>
                <div>
                  <h3>{detail.zh}</h3>
                  <small className="civ-en">{detail.en}</small>
                </div>
              </div>
              <p className="civ-type">{detail.desc}</p>
              <h4>文明加成</h4>
              <ul>
                {detail.bon.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <h4>团队加成</h4>
              <p>{detail.tb}</p>
              <h4>独特单位</h4>
              <p className="civ-uu">{uniqueUnitLabel(detail.uu)}</p>
              <Link className="civ-open-detail" to={`/civ/${detail.en}`}>
                打开完整文明资料
                <Icon name="arrow-right" />
              </Link>
              <p className="civ-help">完整资料在本站打开，本页条件保留。</p>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
