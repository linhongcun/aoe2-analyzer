import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { CounterGroup, rowId, pkButtonId } from './CounterGroup';
import { civs, type Core } from '../../../data';
import { hasValidCombatPairs, reverseCounters, type ReverseCounterFilter } from '../../../domain/reverseCounters';
import type { Trees, Unit } from '../../../domain/types';
import { CivPicker } from '../../../shared/ui/CivPicker';
import { DATA_SOURCES } from '../../../shared/utils/dataInfo';
import { useReverseCounterSession, writeReverseCounterSession, type ReverseCounterLocation, type ReverseCounterSession } from '../reverseCounterSession';
import { AGE_ZH } from './ReverseCounterAvailability';
import { ReverseCounterEmptyState } from './ReverseCounterEmptyState';
import { getPkUnavailableReason, RetainedPkSummary, selectPkSummaryMode } from './ReverseCounterPkSummary';
import * as restoreNoteHelpers from './reverseCounterRestoreNote';
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
  const detailOnly = !core.unitById[target.id];
  const currentSession = useReverseCounterSession(target.id, targetCiv, location);
  const currentSessionIdentity = currentSession.identity;
  const {
    state: restoreNoteState,
    setState: setRestoreNoteState,
    note: restoreNote,
    sessionIdentityRef: currentSessionIdentityRef,
  } = restoreNoteHelpers.useRestoreNoteState(currentSessionIdentity);
  const stored = currentSession.record;
  const { markRestored } = currentSession;
  const storedFilter = stored?.filters;
  const initialFilters: ReverseCounterFilter = {
    civ: storedFilter?.civ && civNames.includes(storedFilter.civ) ? storedFilter.civ : '',
    age: storedFilter?.age ?? null,
  };
  const [filter, setFilter] = useState<ReverseCounterFilter>(initialFilters);
  const [collapsed, setCollapsed] = useState<string[]>(stored?.collapsed ?? []);
  const [expandedRows, setExpandedRows] = useState<string[]>(stored?.expandedRows ?? []);
  const [openPk, setOpenPk] = useState<{ category: string; id: number } | null>(detailOnly ? null : (stored?.openPk ?? null));
  const [originButton, setOriginButton] = useState('');
  const [defaultGroupsReady, setDefaultGroupsReady] = useState(!!stored);
  const [activeSessionIdentity, setActiveSessionIdentity] = useState(currentSession.identity);
  const sessionStateReady = activeSessionIdentity === currentSession.identity;
  if (!sessionStateReady) {
    const next = currentSession.record;
    restoreNoteHelpers.clearRestoreNote(currentSessionIdentity, setRestoreNoteState);
    setFilter({
      civ: next?.filters.civ && civNames.includes(next.filters.civ) ? next.filters.civ : '',
      age: next?.filters.age ?? null,
    });
    setCollapsed(next?.collapsed ?? []);
    setExpandedRows(next?.expandedRows ?? []);
    setOpenPk(detailOnly ? null : (next?.openPk ?? null));
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
    restoreNoteHelpers.replaceRestoreNote(currentSessionIdentity, setRestoreNoteState, '所选 PK 形态已不在当前正贡献目录中或无法核实，已关闭核对。');
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

  restoreNoteHelpers.useRestoreNoteEffect({
    currentSession,
    sessionIdentityRef: currentSessionIdentityRef,
    sessionStateReady,
    treesPending,
    corePending,
    coreError,
    hasBasePkRow: !!basePkRow,
    state: restoreNoteState,
    setNoteState: setRestoreNoteState,
    setOriginButton,
    pkButtonId,
  });

  useEffect(() => {
    if (sessionStateReady && !currentSession.restorePending) saveSession();
  }, [sessionStateReady, currentSession.restorePending, saveSession]);

  const toggleGroup = (category: string) => {
    setCollapsed((current) => (current.includes(category) ? current.filter((item) => item !== category) : [...current, category]));
  };
  const changeFilter = (next: ReverseCounterFilter) => {
    restoreNoteHelpers.clearRestoreNote(currentSessionIdentity, setRestoreNoteState);
    markRestored();
    setFilter(next);
    setOpenPk(null);
    setDefaultGroupsReady(false);
    setCollapsed([]);
  };
  const closePk = (focusId = originButton || (openPk ? pkButtonId(openPk.category, openPk.id) : '')) => {
    restoreNoteHelpers.invalidateRestoreNote(restoreNoteState, currentSessionIdentity, setRestoreNoteState);
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
