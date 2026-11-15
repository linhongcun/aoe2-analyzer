import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { civs, type Core } from '../../../data';
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
import { AGE_ZH } from './ReverseCounterAvailability';
import { ReverseCounterEmptyState } from './ReverseCounterEmptyState';
import { getPkUnavailableReason, PkSummary, RetainedPkSummary, selectPkSummaryMode } from './ReverseCounterPkSummary';
import { clearRestoreNote, invalidateRestoreNote, replaceRestoreNote, restoreNoteForRecord, scheduleRestoreNote } from './reverseCounterRestoreNote';
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
  showNoRows,
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
  showNoRows: boolean;
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
            const selectedMember = row.members.find((member) => member.id === openPk) ?? null;
            const selectedRow = selectedMember ? { ...row, unit: selectedMember } : null;
            const selectedPkAllowed = rowPkAllowed && !!selectedMember && hasValidCombatPairs(selectedMember);
            const duelHref =
              selectedMember && selectedPkAllowed && trees && !treesError && !treesPending && targetCiv && enemyCiv
                ? reverseCounterDuelHref(target, selectedMember, core, trees, targetCiv, enemyCiv, age ?? 4)
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
                    aria-expanded={!!selectedMember}
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
                {selectedRow && (
                  <PkSummary
                    id={id}
                    row={selectedRow}
                    buttonId={buttonId}
                    target={target}
                    targetCiv={targetCiv}
                    enemyCiv={enemyCiv}
                    age={age}
                    core={core}
                    trees={trees}
                    treesPending={treesPending}
                    treesError={treesError}
                    retryTrees={retryTrees}
                    duelHref={duelHref}
                    returnFocus={returnFocus}
                  />
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
          {!group.rows.length && showNoRows && (
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
  const [restoreNoteState, setRestoreNoteState] = useState({ generation: 0, note: '' });
  const restoreNote = restoreNoteState.note;
  const [defaultGroupsReady, setDefaultGroupsReady] = useState(!!stored);
  const [activeSessionIdentity, setActiveSessionIdentity] = useState(currentSession.identity);
  const sessionStateReady = activeSessionIdentity === currentSession.identity;
  if (!sessionStateReady) {
    const next = currentSession.record;
    clearRestoreNote(setRestoreNoteState);
    setFilter({
      civ: next?.filters.civ && civNames.includes(next.filters.civ) ? next.filters.civ : '',
      age: next?.filters.age ?? null,
    });
    setCollapsed(next?.collapsed ?? []);
    setExpandedRows(next?.expandedRows ?? []);
    setOpenPk(next?.openPk ?? null);
    setOriginButton('');
    setDefaultGroupsReady(!!next);
    setActiveSessionIdentity(currentSession.identity);
  }
  const queryTrees = treesError || treesPending ? null : trees;
  const rawResult = useMemo(() => reverseCounters(rawTarget, core.units, core, civNames, queryTrees, filter), [rawTarget, core, queryTrees, filter]);
  const baseResult = useMemo(() => reverseCounters(rawTarget, core.units, core, civNames, null, { civ: '', age: null }), [rawTarget, core]);
  const result = useMemo(() => {
    const targetDataWarning = targetIssues.some((field) => ['atks', 'armc', 'arms'].includes(field));
    if ((targetDataWarning || corePending || coreError) && rawResult.state === 'ready') return { ...rawResult, state: 'partial' as const };
    return rawResult;
  }, [rawResult, targetIssues, corePending, coreError]);
  const targetDataWarning = targetIssues.some((field) => ['atks', 'armc', 'arms'].includes(field));
  const filterActive = !!filter.civ || filter.age !== null;
  const queryCount = result.groups.reduce((sum, group) => sum + group.rows.length, 0);
  const treeAvailabilityUnresolved = result.state === 'availability-unknown';
  const basePkRow = useMemo(() => {
    if (
      !sessionStateReady ||
      !openPk ||
      corePending ||
      coreError ||
      baseResult.state !== 'ready' ||
      targetIssues.length > 0 ||
      !hasValidCombatPairs(rawTarget)
    ) {
      return null;
    }
    const group = baseResult.groups.find((item) => item.category === openPk.category);
    const row = group?.rows.find((item) => item.damage > 0 && item.members.some((member) => member.id === openPk.id));
    const member = row?.members.find((item) => item.id === openPk.id);
    const currentUnit = core.unitById[openPk.id];
    return row && member && currentUnit && member === currentUnit && hasValidCombatPairs(currentUnit) ? { ...row, unit: currentUnit } : null;
  }, [sessionStateReady, openPk, corePending, coreError, targetIssues, rawTarget, baseResult, core]);
  const filteredPkRow = useMemo(() => {
    if (!sessionStateReady || !openPk || corePending || coreError || result.state !== 'ready') return null;
    const group = result.groups.find((item) => item.category === openPk.category);
    const row = group?.rows.find((item) => item.damage > 0 && item.members.some((member) => member.id === openPk.id));
    const member = row?.members.find((item) => item.id === openPk.id);
    const currentUnit = core.unitById[openPk.id];
    return row && member && currentUnit && member === currentUnit && hasValidCombatPairs(currentUnit) ? { ...row, unit: currentUnit } : null;
  }, [sessionStateReady, openPk, corePending, coreError, result, core]);
  const pkSummaryMode = selectPkSummaryMode(sessionStateReady && !!openPk, result.state, !!filteredPkRow, !!basePkRow);
  const pkAllowed = result.state === 'ready' && targetIssues.length === 0 && !corePending && !coreError;
  const pkUnavailableReason = getPkUnavailableReason(target.zh, targetDataWarning, corePending, coreError, result.state);

  if (sessionStateReady && !defaultGroupsReady && result.groups.some((group) => group.rows.length)) {
    const first = result.groups.find((group) => group.rows.length)?.category;
    setCollapsed(result.groups.filter((group) => group.category !== first).map((group) => group.category));
    setDefaultGroupsReady(true);
  }

  if (sessionStateReady && openPk && !corePending && !coreError && !filteredPkRow && !basePkRow) {
    setOpenPk(null);
    setOriginButton('');
    replaceRestoreNote(setRestoreNoteState, '所选 PK 形态已不在当前正贡献目录中或无法核实，已关闭核对。');
  }

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
    if (!sessionStateReady || !restorePending || !sessionRecord || treesPending || corePending || coreError) return;
    const record = sessionRecord;
    const exact = record.anchor ? document.getElementById(record.anchor) : null;
    const fallback = record.fallbackAnchor ? document.getElementById(record.fallbackAnchor) : null;
    const destination = record.anchor || record.fallbackAnchor ? (exact ?? fallback ?? document.getElementById('unit-reverse-counters')) : null;
    const note = restoreNoteForRecord(record, !!exact, !!basePkRow);
    if (restoreNoteState.note !== note) return scheduleRestoreNote(restoreNoteState, setRestoreNoteState, note);
    const frame = requestAnimationFrame(() => {
      if (destination) window.scrollTo({ top: window.scrollY + destination.getBoundingClientRect().top - record.offset, behavior: 'auto' });
      const focus =
        (record.focus ? document.getElementById(record.focus) : null) ??
        (record.openPk ? document.getElementById(pkButtonId(record.openPk.category, record.openPk.id)) : null);
      if (record.focus || (record.openPk && destination)) (focus ?? destination)?.focus({ preventScroll: true });
      if (record.openPk) setOriginButton(pkButtonId(record.openPk.category, record.openPk.id));
      markRestored();
    });
    return () => cancelAnimationFrame(frame);
  }, [sessionStateReady, restorePending, sessionRecord, treesPending, corePending, coreError, basePkRow, restoreNoteState, markRestored]);

  useEffect(() => {
    if (sessionStateReady && !currentSession.restorePending) saveSession();
  }, [sessionStateReady, currentSession.restorePending, saveSession]);

  const toggleGroup = (category: string) => {
    setCollapsed((current) => (current.includes(category) ? current.filter((item) => item !== category) : [...current, category]));
  };
  const changeFilter = (next: ReverseCounterFilter) => {
    clearRestoreNote(setRestoreNoteState);
    markRestored();
    setFilter(next);
    setOpenPk(null);
    setDefaultGroupsReady(false);
    setCollapsed([]);
  };
  const closePk = (focusId = originButton || (openPk ? pkButtonId(openPk.category, openPk.id) : '')) => {
    invalidateRestoreNote(restoreNoteState, setRestoreNoteState);
    markRestored();
    setOpenPk(null);
    requestAnimationFrame(() => {
      const focus =
        (focusId ? document.getElementById(focusId) : null) ??
        document.getElementById('unit-reverse-title') ??
        document.getElementById('unit-reverse-counters');
      focus?.focus();
    });
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

  const dataIsResolved = !corePending && !coreError && !treesPending && !treesError;
  const readyResults = result.state === 'ready' && dataIsResolved && targetIssues.length === 0;
  const emptyPanelKind = queryCount === 0 && readyResults ? (filterActive ? 'filtered' : 'base') : null;
  const partialEmpty = queryCount === 0 && result.state === 'partial' && dataIsResolved;
  const visibleGroups = emptyPanelKind || (queryCount === 0 && !readyResults) ? [] : result.groups;

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
        <h2 id="unit-reverse-title" tabIndex={-1}>
          对本单位有类别加成的单位
        </h2>
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
      {emptyPanelKind === 'base' ? <ReverseCounterEmptyState kind="base" /> : null}
      {emptyPanelKind === 'filtered' ? (
        <ReverseCounterEmptyState kind="filtered" targetName={target.zh} onClear={() => changeFilter({ civ: '', age: null })} />
      ) : null}
      {!emptyPanelKind && partialEmpty ? <ReverseCounterEmptyState kind="partial" /> : null}
      {visibleGroups.map((group) => (
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
          openPk={pkSummaryMode === 'filtered' && openPk?.category === group.category ? openPk.id : null}
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
          showNoRows={readyResults}
          returnFocus={closePk}
        />
      ))}
      {pkSummaryMode === 'retained' && openPk && basePkRow && (
        <RetainedPkSummary
          id={rowId(openPk.category, openPk.id)}
          row={basePkRow}
          buttonId={pkButtonId(openPk.category, openPk.id)}
          target={target}
          targetCiv={targetCiv}
          enemyCiv={filter.civ}
          age={filter.age}
          core={core}
          trees={trees}
          treesPending={treesPending}
          treesError={treesError}
          retryTrees={retryTrees}
          unresolved={treeAvailabilityUnresolved}
          returnFocus={closePk}
        />
      )}
      <p className="ud-reverse-footer">
        基础目录来源：DE <span className="num nw">{DATA_SOURCES.patch?.build ?? '待确认'}</span>
      </p>
    </section>
  );
}
