import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { civByEn, civs, type Core } from '../../../data';
import {
  hasValidCombatPairs,
  reverseCounterDuelHref,
  reverseCounters,
  type ReverseCounterFilter,
  type ReverseCounterGroup,
} from '../../../domain/reverseCounters';
import type { Trees, Unit } from '../../../domain/types';
import { UnitIcon } from '../../../shared/ui/art';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import { useReverseCounterSession, writeReverseCounterSession, type ReverseCounterLocation, type ReverseCounterSession } from '../reverseCounterSession';
import { AGE_ZH, PkAvailability } from './ReverseCounterAvailability';
import './reverse-counters.css';

interface Props {
  target: Unit;
  rawTarget: Unit;
  targetIssues: string[];
  core: Core;
  corePending: boolean;
  coreError: boolean;
  retryCore: () => void;
  trees: Trees | null;
  rawTrees: unknown;
  treesPending: boolean;
  treesError: boolean;
  retryTrees: () => void;
  targetCiv: string;
  location: ReverseCounterLocation;
}

const civNames = civs.map((civ) => civ.en);
const groupId = (category: string) => `reverse-counter-group-${encodeURIComponent(category)}`;
const rowId = (category: string, id: number) => `reverse-counter-row-${encodeURIComponent(category)}-${id}`;
const pkButtonId = (category: string, id: number) => `reverse-counter-pk-${encodeURIComponent(category)}-${id}`;

function CounterGroup({
  group,
  collapsed,
  expanded,
  onToggle,
  onExpandRows,
  onOpenPk,
  openPk,
  target,
  targetCiv,
  enemyCiv,
  age,
  core,
  trees,
  treesPending,
  treesError,
  retryTrees,
  pkAllowed,
  pkUnavailableReason,
  filterActive,
  returnFocus,
}: {
  group: ReverseCounterGroup;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpandRows: () => void;
  onOpenPk: (id: number, buttonId: string) => void;
  openPk: number | null;
  target: Unit;
  targetCiv: string;
  enemyCiv: string;
  age: number | null;
  core: Core;
  trees: Trees | null;
  treesPending: boolean;
  treesError: boolean;
  retryTrees: () => void;
  pkAllowed: boolean;
  pkUnavailableReason: string;
  filterActive: boolean;
  returnFocus: (id: string) => void;
}) {
  const visibleRows = expanded ? group.rows : group.rows.slice(0, 5);
  const ariaId = groupId(group.category);
  return (
    <section className="ud-reverse-group" data-reverse-group="" data-t="reverse-counter-group" id={ariaId} tabIndex={-1}>
      <button type="button" className="ud-reverse-group-toggle" aria-expanded={!collapsed} aria-controls={`${ariaId}-rows`} onClick={onToggle}>
        <span>{group.category}</span>
        <span className="ud-reverse-count">
          本单位该类护甲 <span className="num nw">{group.armor}</span> · <span className="num nw">{group.rows.length} 项</span>
        </span>
        <span className="ud-btn">{collapsed ? '展开' : '收起'}</span>
      </button>
      {!collapsed && (
        <div id={`${ariaId}-rows`} className="ud-reverse-rows">
          {visibleRows.length > 0 && (
            <div className="ud-reverse-table-head" aria-hidden="true">
              <span>敌方单位形态</span>
              <span>该类攻击</span>
              <span>目标该类护甲</span>
              <span>类别贡献</span>
              <span />
            </div>
          )}
          {visibleRows.map((row) => {
            const id = rowId(group.category, row.unit.id);
            const buttonId = pkButtonId(group.category, row.unit.id);
            const counterCombatValid = hasValidCombatPairs(row.unit);
            const rowPkAllowed = pkAllowed && counterCombatValid;
            const duelHref =
              rowPkAllowed && trees && !treesError && !treesPending && targetCiv && enemyCiv
                ? reverseCounterDuelHref(target, row.unit, core, trees, targetCiv, enemyCiv, age ?? 4)
                : null;
            return (
              <div className="ud-reverse-row-wrap" data-reverse-row="" id={id} key={row.unit.id} tabIndex={-1}>
                <div className="ud-reverse-row">
                  <Link id={`${id}-unit-link`} className="ud-reverse-unit" to={`/unit/${row.unit.id}`} data-t="reverse-counter-link">
                    <UnitIcon u={row.unit} />
                    <span>
                      <strong>{row.unit.zh}</strong>
                      <small>{row.unit.en}</small>
                    </span>
                  </Link>
                  <span className="ud-reverse-value">
                    <span className="ud-reverse-mobile-label">该类攻击</span>
                    <span className="num nw">{row.attack}</span>
                  </span>
                  <span className="ud-reverse-value">
                    <span className="ud-reverse-mobile-label">目标该类护甲</span>
                    <span className="num nw">{row.armor}</span>
                  </span>
                  <strong className="ud-reverse-damage">
                    <span className="ud-reverse-mobile-label">类别贡献</span>
                    <span className="num nw">+{row.damage}</span>
                  </strong>
                  <button
                    id={buttonId}
                    type="button"
                    className="ud-btn ud-reverse-pk-button"
                    data-t="reverse-counter-pk"
                    disabled={!rowPkAllowed}
                    aria-expanded={openPk === row.unit.id}
                    onClick={() => onOpenPk(row.unit.id, buttonId)}
                  >
                    核对 PK
                  </button>
                </div>
                {!rowPkAllowed && (
                  <p className="ud-reverse-pk-disabled" role="status">
                    {counterCombatValid ? pkUnavailableReason : `敌方单位${row.unit.zh}的攻击、护甲或护甲类别资料异常，不能生成 PK。`}
                  </p>
                )}
                {openPk === row.unit.id && (
                  <div className="ud-reverse-pk" role="region" aria-label="核对单位 PK">
                    <h3 tabIndex={-1} id={`reverse-counter-pk-title-${row.unit.id}`}>
                      核对单位 PK
                    </h3>
                    <div className="ud-reverse-pk-sides">
                      <div className="ud-reverse-pk-side">
                        <span>A · 本单位</span>
                        <UnitIcon u={target} />
                        <Link id={`${id}-target-link`} to={`/unit/${target.id}`}>
                          {target.zh}
                        </Link>
                        <span>{civByEn(targetCiv)?.zh ?? '未选择本单位文明'}</span>
                      </div>
                      <div className="ud-reverse-pk-side">
                        <span>B · 敌方单位</span>
                        <UnitIcon u={row.unit} />
                        <Link id={`${id}-counter-link`} to={`/unit/${row.unit.id}`}>
                          {row.unit.zh}
                        </Link>
                        <span>{civByEn(enemyCiv)?.zh ?? '未选择敌方文明'}</span>
                      </div>
                    </div>
                    <p className="ud-reverse-pk-era">
                      双方时代：{age === null ? `${AGE_ZH[4]}（时代不限时用于核对）` : AGE_ZH[age]}
                      <span>自选科技：无 · 团队科技：无</span>
                    </p>
                    <PkAvailability
                      target={target}
                      counter={row.unit}
                      targetCiv={targetCiv}
                      counterCiv={enemyCiv}
                      age={age ?? 4}
                      core={core}
                      trees={trees}
                      treesPending={treesPending}
                      treesError={treesError}
                      retryTrees={retryTrees}
                    />
                    <p className="ud-reverse-pk-note">PK 会按双方文明效果及现有模型计算，结果与基础目录类别贡献口径不同。</p>
                    <div className="ud-reverse-pk-actions">
                      {duelHref && (
                        <Link id={`${id}-duel-link`} className="ud-btn ud-reverse-primary" to={duelHref} data-t="reverse-counter-open-duel">
                          打开单位 PK
                        </Link>
                      )}
                      {!duelHref && (
                        <button type="button" className="ud-btn ud-reverse-primary" data-t="reverse-counter-open-duel" disabled>
                          打开单位 PK（暂不可用）
                        </button>
                      )}
                      <button type="button" className="ud-btn" onClick={() => returnFocus(buttonId)}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {group.rows.length > 5 && (
            <button type="button" className="ud-btn ud-reverse-more" onClick={onExpandRows}>
              {expanded ? (
                '收起其余单位'
              ) : (
                <>
                  展开本类其余 <span className="num nw">{group.rows.length - 5} 个单位</span>
                </>
              )}
            </button>
          )}
          {!group.rows.length && (
            <p className="ud-reverse-no-row">{filterActive ? '当前筛选下没有该类别的正贡献匹配。' : '基础目录未找到该类别的正贡献匹配。'}</p>
          )}
        </div>
      )}
    </section>
  );
}

export function ReverseCounters({
  target,
  rawTarget,
  targetIssues,
  core,
  corePending,
  coreError,
  retryCore,
  trees,
  rawTrees,
  treesPending,
  treesError,
  retryTrees,
  targetCiv,
  location,
}: Props) {
  const currentSession = useReverseCounterSession(target.id, targetCiv, location);
  const stored = currentSession.record;
  const { restorePending, record: sessionRecord, markRestored } = currentSession;
  const storedFilter = stored?.filters;
  const initialFilters: ReverseCounterFilter = {
    civ: storedFilter?.civ && civNames.includes(storedFilter.civ) ? storedFilter.civ : '',
    age: storedFilter?.age ?? null,
  };
  const [filter, setFilter] = useState<ReverseCounterFilter>(initialFilters);
  const [collapsed, setCollapsed] = useState<string[]>(stored?.collapsed ?? []);
  const [expandedRows, setExpandedRows] = useState<string[]>(stored?.expandedRows ?? []);
  const [openPk, setOpenPk] = useState<{ category: string; id: number } | null>(stored?.openPk ?? null);
  const [originButton, setOriginButton] = useState('');
  const [restoreNote, setRestoreNote] = useState('');
  const defaultGroupsReady = useRef(!!stored);
  const activeSessionKey = useRef(currentSession.key);
  const queryTrees = treesError || treesPending ? null : trees;
  const rawResult = useMemo(() => reverseCounters(rawTarget, core.units, core, civNames, queryTrees, filter), [rawTarget, core, queryTrees, filter]);
  const result = useMemo(() => {
    const targetDataWarning = targetIssues.some((field) => ['atks', 'armc', 'arms'].includes(field));
    if ((targetDataWarning || corePending || coreError) && rawResult.state === 'ready') return { ...rawResult, state: 'partial' as const };
    return rawResult;
  }, [rawResult, targetIssues, corePending, coreError]);
  const targetDataWarning = targetIssues.some((field) => ['atks', 'armc', 'arms'].includes(field));
  const filterActive = !!filter.civ || filter.age !== null;
  const queryCount = result.groups.reduce((sum, group) => sum + group.rows.length, 0);
  const pkAllowed = result.state === 'ready' && targetIssues.length === 0 && !corePending && !coreError;
  const pkUnavailableReason = targetDataWarning
    ? `本单位${target.zh}的攻击或护甲类别资料不完整，不能生成 PK。`
    : corePending
      ? '正在重新核验目录资料，暂不能生成 PK。'
      : coreError
        ? '目录资料重试失败，暂不能核实 PK。'
        : result.state === 'availability-unknown'
          ? '科技树可用性尚未核实，暂不能生成 PK。'
          : result.state === 'unreadable'
            ? '本次类别数据无法核实，暂不能生成 PK。'
            : '目录中有部分异常数据，暂不能安全生成 PK。';

  useEffect(() => {
    if (activeSessionKey.current === currentSession.key) return;
    activeSessionKey.current = currentSession.key;
    const next = currentSession.record;
    setFilter({
      civ: next?.filters.civ && civNames.includes(next.filters.civ) ? next.filters.civ : '',
      age: next?.filters.age ?? null,
    });
    setCollapsed(next?.collapsed ?? []);
    setExpandedRows(next?.expandedRows ?? []);
    setOpenPk(next?.openPk ?? null);
    defaultGroupsReady.current = !!next;
  }, [currentSession.key, currentSession.record]);

  useEffect(() => {
    if (defaultGroupsReady.current || !result.groups.some((group) => group.rows.length)) return;
    const first = result.groups.find((group) => group.rows.length)?.category;
    setCollapsed(result.groups.filter((group) => group.category !== first).map((group) => group.category));
    defaultGroupsReady.current = true;
  }, [result.groups]);

  const saveSession = useCallback(
    (anchor?: string, fallbackAnchor?: string, top?: number, focus?: string | null) => {
      const root = document.getElementById('unit-reverse-counters');
      const viewportRows = [...document.querySelectorAll<HTMLElement>('[data-reverse-row]')];
      const visible = viewportRows.find((row) => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      });
      const rootRect = root?.getBoundingClientRect();
      const rootVisible = !!rootRect && rootRect.bottom > 0 && rootRect.top < window.innerHeight;
      const anchorElement = (anchor && document.getElementById(anchor)) || visible || (rootVisible ? root : null);
      const fallbackElement = (fallbackAnchor && document.getElementById(fallbackAnchor)) || anchorElement?.closest('[data-reverse-group]') || null;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
      const value: ReverseCounterSession = {
        version: 1,
        location: { pathname: location.pathname, search: location.search, hash: location.hash },
        filters: filter,
        collapsed,
        expandedRows,
        openPk,
        anchor: anchorElement?.id || null,
        fallbackAnchor: anchorElement ? fallbackElement?.id || root?.id || null : null,
        offset: top ?? anchorElement?.getBoundingClientRect().top ?? 0,
        focus: focus === undefined ? (anchorElement ? active || null : null) : focus,
      };
      writeReverseCounterSession(currentSession.key, value);
    },
    [currentSession.key, location, filter, collapsed, expandedRows, openPk],
  );

  useEffect(() => {
    const save = () => saveSession();
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [saveSession]);

  useEffect(() => {
    if (!restorePending || !sessionRecord || treesPending) return;
    const record = sessionRecord;
    const frame = requestAnimationFrame(() => {
      const exact = record.anchor ? document.getElementById(record.anchor) : null;
      const fallback = record.fallbackAnchor ? document.getElementById(record.fallbackAnchor) : null;
      const hasReaderLocation = !!(record.anchor || record.fallbackAnchor);
      const destination = hasReaderLocation ? (exact ?? fallback ?? document.getElementById('unit-reverse-counters')) : null;
      if (destination) window.scrollTo({ top: window.scrollY + destination.getBoundingClientRect().top - record.offset, behavior: 'auto' });
      const focus =
        (record.focus ? document.getElementById(record.focus) : null) ??
        (record.openPk ? document.getElementById(pkButtonId(record.openPk.category, record.openPk.id)) : null);
      if (record.focus || (record.openPk && destination)) (focus ?? destination)?.focus({ preventScroll: true });
      if (!hasReaderLocation) setRestoreNote('已恢复上次筛选与展开状态；保持当前阅读位置。');
      else if (!exact) setRestoreNote('已恢复本单位、敌方筛选与阅读位置；原结果行已变化，已定位到本类或查询区。');
      else setRestoreNote('已恢复上次筛选与阅读位置。');
      if (record.openPk) setOriginButton(pkButtonId(record.openPk.category, record.openPk.id));
      markRestored();
    });
    return () => cancelAnimationFrame(frame);
  }, [restorePending, sessionRecord, treesPending, markRestored]);

  useEffect(() => {
    if (!currentSession.restorePending) saveSession();
  }, [currentSession.restorePending, saveSession]);

  const toggleGroup = (category: string) => {
    setCollapsed((current) => (current.includes(category) ? current.filter((item) => item !== category) : [...current, category]));
  };
  const changeFilter = (next: ReverseCounterFilter) => {
    setFilter(next);
    setOpenPk(null);
    setOriginButton('');
    setRestoreNote('');
    defaultGroupsReady.current = false;
    setCollapsed([]);
  };
  const closePk = (focusId = originButton || (openPk ? pkButtonId(openPk.category, openPk.id) : '')) => {
    setOpenPk(null);
    if (focusId) requestAnimationFrame(() => document.getElementById(focusId)?.focus());
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && openPk) {
      event.preventDefault();
      closePk();
    }
  };
  const openPkForRow = (category: string, id: number, buttonId: string) => {
    setOpenPk({ category, id });
    setOriginButton(buttonId);
    requestAnimationFrame(() => document.getElementById(`reverse-counter-pk-title-${id}`)?.focus());
  };
  const captureNavigation = (event: MouseEvent<HTMLElement>) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link) return;
    const row = link.closest<HTMLElement>('[data-reverse-row]');
    const group = link.closest<HTMLElement>('[data-reverse-group]');
    const rowOffset = row?.getBoundingClientRect().top;
    const focus = link.id || (document.activeElement instanceof HTMLElement ? document.activeElement.id || null : null);
    saveSession(row?.id ?? group?.id, group?.id, rowOffset, focus);
  };

  const emptyText =
    queryCount === 0 && result.state === 'ready'
      ? filterActive
        ? '当前筛选下没有正贡献类别匹配。可清除筛选查看基础目录。'
        : '基础目录未找到正贡献类别匹配；这不表示该单位没有反制方式。'
      : '';

  return (
    <section
      id="unit-reverse-counters"
      className="ud-section ud-reverse"
      aria-labelledby="unit-reverse-title"
      aria-busy={corePending || treesPending}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClickCapture={captureNavigation}
    >
      <div className="ud-reverse-heading">
        <h2 id="unit-reverse-title">对本单位有类别加成的单位</h2>
        <span className="ud-reverse-source">基础目录</span>
      </div>
      <p className="ud-reverse-intro">按本单位的护甲类别查找，只列扣除该类护甲后贡献为正的形态。</p>
      <p className="ud-reverse-model">基础目录参考 · 文明仅筛可用性，数值未套文明、团队或自选科技加成。</p>
      <p className="ud-reverse-boundary">未评估射程、穿透／范围伤害、走位及特殊能力。没列出不代表不能应对；类别贡献不等于单次总伤害或胜负。</p>
      <p className="ud-reverse-summary" role="status" aria-live="polite" aria-atomic="true" data-t="reverse-counter-summary">
        {corePending ? (
          '正在重新核验目录资料。'
        ) : coreError ? (
          '目录资料核验失败；当前结果不完整。'
        ) : treesPending ? (
          '正在核对可用性筛选。'
        ) : result.state === 'availability-unknown' ? (
          '可用性尚未核实；当前结果不是零匹配。'
        ) : result.state === 'unreadable' ? (
          '类别资料无法解析；当前结果不是零匹配。'
        ) : result.state === 'partial' ? (
          <>
            当前保留 <span className="num nw">{queryCount} 项类别贡献</span>；部分资料无法解析。
          </>
        ) : (
          <>
            {filterActive ? '当前筛选' : '基础目录'}：<span className="num nw">{queryCount} 项类别贡献</span>。
          </>
        )}
      </p>
      {target.id === 331 && (
        <p className="ud-reverse-special" role="note">
          此形态使用目录打包护甲；进攻资料使用展开攻击。反向列表仅针对目录打包护甲，不代表展开态。
        </p>
      )}

      <div className="ud-reverse-controls">
        <div>
          <label>敌方文明</label>
          <CivPicker
            id="reverse-counter-civ"
            label="筛选敌方文明"
            value={filter.civ}
            allowed={civNames}
            none="不限"
            onChange={(civ) => changeFilter({ ...filter, civ })}
          />
        </div>
        <div>
          <label htmlFor="reverse-counter-age">敌方时代</label>
          <select
            id="reverse-counter-age"
            value={filter.age ?? ''}
            onChange={(event) => changeFilter({ ...filter, age: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">不限</option>
            {[1, 2, 3, 4].map((age) => (
              <option key={age} value={age}>
                {AGE_ZH[age]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="ud-btn" onClick={() => changeFilter({ civ: '', age: null })}>
          清除筛选
        </button>
      </div>
      <p className="ud-reverse-age-note">时代表示截至该时代可用的形态，包含早期形态；不代表已研究科技。</p>
      {restoreNote && (
        <p className="ud-reverse-restore" role="status">
          {restoreNote}
        </p>
      )}
      {treesError && (
        <p className="ud-reverse-warning" role="alert">
          {treesPending
            ? '正在重试科技树资料；目录基础资料仍可查看。'
            : rawTrees
              ? '科技树结构无法解析，暂时不能判断筛选结果。'
              : '可用性资料加载失败，暂时不能判断筛选结果。'}
          <button type="button" className="ud-btn" onClick={retryTrees} disabled={treesPending}>
            {treesPending ? '正在重试…' : '重试目录资料'}
          </button>
        </p>
      )}
      {(result.state === 'partial' || result.state === 'unreadable' || corePending || coreError) && (
        <p className="ud-reverse-warning" role={coreError ? 'alert' : 'status'}>
          {corePending
            ? '正在重试目录资料；当前结果尚未重新核实。'
            : coreError
              ? '目录资料重试失败；当前结果不能视为完整。'
              : '查询数据部分或全部无法解析，可能是缓存结构异常；可重新读取并核验目录资料。'}
          <button type="button" className="ud-btn" onClick={retryCore} disabled={corePending}>
            {corePending ? '正在重试…' : '重试目录资料'}
          </button>
        </p>
      )}
      {targetDataWarning && (
        <p className="ud-reverse-warning" role="status">
          本单位攻击或护甲类别资料部分无法解析；异常值未补成 0，PK 核对已停用。
        </p>
      )}
      {result.state === 'availability-unknown' && !treesError && (
        <p className="ud-reverse-warning" role="status">
          {treesPending ? '正在核对可用性资料；目录基础资料仍可阅读。' : '科技树资料尚不可用，当前不能把筛选结果当作零匹配。'}
          {!treesPending && (
            <button type="button" className="ud-btn" onClick={retryTrees}>
              重试目录资料
            </button>
          )}
        </p>
      )}
      {result.problems.length > 0 && result.state !== 'availability-unknown' && (
        <div className="ud-reverse-warning" role={result.state === 'unreadable' ? 'alert' : 'status'}>
          {result.problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      )}
      {emptyText && (
        <p className="ud-reverse-empty" role="status">
          {emptyText}
        </p>
      )}
      {result.state === 'partial' && queryCount === 0 && !corePending && !coreError && (
        <p className="ud-reverse-empty">部分目录资料无法解析，暂时不能确认类别贡献；这不是零匹配。</p>
      )}
      {result.groups.map((group) => (
        <CounterGroup
          key={group.category}
          group={group}
          collapsed={collapsed.includes(group.category)}
          expanded={expandedRows.includes(group.category)}
          onToggle={() => toggleGroup(group.category)}
          onExpandRows={() =>
            setExpandedRows((current) => (current.includes(group.category) ? current.filter((item) => item !== group.category) : [...current, group.category]))
          }
          onOpenPk={(id, buttonId) => openPkForRow(group.category, id, buttonId)}
          openPk={openPk?.category === group.category ? openPk.id : null}
          target={target}
          targetCiv={targetCiv}
          enemyCiv={filter.civ}
          age={filter.age}
          core={core}
          trees={trees}
          treesPending={treesPending}
          treesError={treesError}
          retryTrees={retryTrees}
          pkAllowed={pkAllowed}
          pkUnavailableReason={pkUnavailableReason}
          filterActive={filterActive}
          returnFocus={closePk}
        />
      ))}
      <p className="ud-reverse-footer">
        基础目录来源：DE <span className="num nw">{DATA_SOURCES.patch?.build ?? '待确认'}</span>
      </p>
    </section>
  );
}
