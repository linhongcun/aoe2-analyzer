/**
 * 共享单位选择器（Issue 1280）：
 * 支持中文/英文/拼音/别名搜索、文明可用置顶与过滤、兵种快捷芯片、统一默认排序、
 * 分批挂载、桌面动态视口翻转、窄屏底部抽屉、快打 Enter 竞态保护与无障碍焦点陷阱。
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import { createPortal } from 'react-dom';
import { civByEn } from '../../data';
import { displayUnitAge } from '../../domain/availabilityAge';
import { civNote, dupIdsIn } from '../../domain/dupNames';
import type { FamilyEntry } from '../../domain/family';
import { AGE_ZH } from '../../domain/ratings';
import type { Unit } from '../../domain/types';
import { buildUnitPickerModel, cleanBuildingName, resolveValidCiv, sliceUnitPickerRows, unitPickerEnterTarget } from '../../domain/unitOrder';
import { UNIT_ROLE_ZH, type UnitRole } from '../../domain/unitRoles';
import { EliteBadge, UnitIcon } from './art';
import { Icon } from './Icon';
import { useFixedPopover } from './useFixedPopover';
import './UnitPicker.css';

const INITIAL_RENDER_LIMIT = 48;
const RENDER_BATCH_STEP = 48;
const SCROLL_LOAD_MARGIN = 240;
const ROLE_KEYS = Object.keys(UNIT_ROLE_ZH) as UnitRole[];

export interface UnitPickerProps {
  id: string;
  value?: Unit;
  list: readonly FamilyEntry[];
  onChange: (u: Unit) => void;
  label: string;
  civ?: string;
  /** 默认 true：不可用单位沉底并允许选中；传 false 时在有效 civ 下仅展示可用单位（预留 Issue 1281） */
  allowUnavailable?: boolean;
  /** 可选：覆写不可用分组标题（默认「{文明}不可用（可选择以切换文明）」） */
  unavailableGroupTitle?: string;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  /** 不可用或未知单位时的警示文案（Issue 1281） */
  unavailableText?: string;
  /** 无对应 Unit 时兜底写入 data-value（如待选 0 或未知 ID） */
  rawValue?: number | string;
  /** 可选：自定义单位显示名（如单位 PK 同名区分后缀），同时用于选项主名与触发按钮 */
  formatLabel?: (unit: Unit) => string;
}

function visibleFocusables(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])')].filter(
    (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  );
}

export function UnitPicker({
  id,
  value,
  list,
  onChange,
  label,
  civ,
  allowUnavailable = true,
  unavailableGroupTitle,
  disabled,
  describedBy,
  invalid,
  unavailableText,
  rawValue,
  formatLabel,
}: UnitPickerProps) {
  const validCiv = resolveValidCiv(civ);
  const [open, setOpen] = useState(false);
  const [prevDisabled, setPrevDisabled] = useState(disabled);
  const [prevCiv, setPrevCiv] = useState(validCiv);
  const [prevAllowUnavailable, setPrevAllowUnavailable] = useState(allowUnavailable);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<UnitRole | ''>('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [act, setAct] = useState(0);
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT);

  if (prevDisabled !== disabled) {
    setPrevDisabled(disabled);
    if (disabled && open) {
      setOpen(false);
      setQ('');
      setRole('');
      setRenderLimit(INITIAL_RENDER_LIMIT);
    }
  }
  if (prevCiv !== validCiv || prevAllowUnavailable !== allowUnavailable) {
    setPrevCiv(validCiv);
    setPrevAllowUnavailable(allowUnavailable);
    if (onlyAvailable) setOnlyAvailable(false);
  }

  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lid = useId();

  const civZh = validCiv ? (civByEn(validCiv)?.zh ?? validCiv) : undefined;
  const effectiveOnlyAvailable = Boolean(validCiv && allowUnavailable && onlyAvailable);
  const isOpen = open && !disabled;

  const model = useMemo(
    () =>
      buildUnitPickerModel({
        list,
        civ: validCiv,
        query: q,
        role,
        onlyAvailable: effectiveOnlyAvailable,
        allowUnavailable,
        unavailableGroupTitle,
      }),
    [list, validCiv, q, role, effectiveOnlyAvailable, allowUnavailable, unavailableGroupTitle],
  );

  const dup = useMemo(() => dupIdsIn(model.opts.map((entry) => entry.u)), [model.opts]);
  const visibleRows = useMemo(() => sliceUnitPickerRows(model.rows, renderLimit), [model.rows, renderLimit]);
  const hasMore = model.opts.length > renderLimit;

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setQ('');
    setRole('');
    setRenderLimit(INITIAL_RENDER_LIMIT);
    if (restoreFocus) btn.current?.focus();
  }, []);

  const closeOffscreen = useCallback(() => close(false), [close]);
  const popover = useFixedPopover(isOpen, btn, panel, closeOffscreen);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => input.current?.focus(), 0);
    const onDoc = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(false);
    };
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !panel.current?.contains(document.activeElement)) {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen || !model.opts.length) return;
    const listEl = listRef.current;
    const item = listEl?.querySelector<HTMLElement>(`[data-idx="${act}"]`);
    if (!listEl || !item) return;
    const listRect = listEl.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < listRect.top) {
      listEl.scrollTop -= listRect.top - itemRect.top;
    } else if (itemRect.bottom > listRect.bottom) {
      listEl.scrollTop += itemRect.bottom - listRect.bottom;
    }
  }, [act, isOpen, model.opts.length]);

  const resetViewportAndFocus = () => {
    setAct(0);
    setRenderLimit(INITIAL_RENDER_LIMIT);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const updateQuery = (next: string) => {
    setQ(next);
    resetViewportAndFocus();
  };

  const updateRole = (next: UnitRole | '') => {
    setRole(next);
    resetViewportAndFocus();
  };

  const toggleOnlyAvailable = () => {
    if (!validCiv || !allowUnavailable) return;
    setOnlyAvailable((v) => !v);
    resetViewportAndFocus();
  };

  const clearAllFilters = () => {
    setQ('');
    setRole('');
    setOnlyAvailable(false);
    resetViewportAndFocus();
    input.current?.focus();
  };

  const pick = (u: Unit) => {
    onChange(u);
    close(true);
  };

  const onListScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!hasMore) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_LOAD_MARGIN) {
      setRenderLimit((n) => Math.min(model.opts.length, n + RENDER_BATCH_STEP));
    }
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      const items = visibleFocusables(panel.current);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1;
      e.preventDefault();
      items[next]!.focus();
      return;
    }
    // 弹层内 <button> 保留原生 Enter / Space 激活，仅在 combobox 输入框聚焦时处理列表键盘导航
    if (e.target !== input.current) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!model.opts.length) {
        setAct(0);
        return;
      }
      const next = Math.min(model.opts.length - 1, act + 1);
      setAct(next);
      if (next >= renderLimit - 8) {
        setRenderLimit((n) => Math.min(model.opts.length, Math.max(n + RENDER_BATCH_STEP, next + 16)));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAct((a) => Math.max(0, a - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setAct(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      if (!model.opts.length) {
        setAct(0);
        return;
      }
      const last = model.opts.length - 1;
      setRenderLimit(model.opts.length);
      setAct(last);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = unitPickerEnterTarget(input.current?.value ?? q, q, model.opts, act, model.pool);
      if (target) pick(target);
    }
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (isOpen) {
      close(true);
      return;
    }
    // 每次打开均以干净的查询与兵种态起手，防止关闭同 tick 的延迟 input 事件残留旧查询
    setQ('');
    setRole('');
    const fresh = buildUnitPickerModel({
      list,
      civ: validCiv,
      query: '',
      role: '',
      onlyAvailable: effectiveOnlyAvailable,
      allowUnavailable,
      unavailableGroupTitle,
    });
    const found = fresh.opts.findIndex((entry) => entry.u.id === value?.id || (!!value && entry.elite?.id === value.id));
    const initialAct = found < 0 ? 0 : found;
    setAct(initialAct);
    setRenderLimit(Math.max(INITIAL_RENDER_LIMIT, initialAct + 16));
    setOpen(true);
  };

  const hasFilters = Boolean(role || effectiveOnlyAvailable);
  const dialog =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className="cp-mask up-mask"
              onMouseDown={(event) => {
                event.preventDefault();
                close(true);
              }}
            />
            <div
              ref={panel}
              className="cp-panel up-panel"
              data-placement={popover.placement}
              style={popover.style}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              onKeyDown={onKey}
            >
              <div className="up-sheet-bar">
                <span className="up-grip" aria-hidden="true" />
                <div className="up-sheet-head">
                  <span className="up-sheet-title">{`选择 ${label}`}</span>
                  <button type="button" className="up-sheet-close" aria-label="关闭" onClick={() => close(true)}>
                    <Icon name="x" />
                  </button>
                </div>
              </div>
              <div className="cp-head up-head">
                <Icon name="search" />
                <input
                  ref={input}
                  className="cp-q"
                  value={q}
                  onChange={(e) => updateQuery(e.target.value)}
                  placeholder="搜索单位（中文、英文、拼音或别名）"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={lid}
                  aria-activedescendant={model.opts[act] ? `${lid}-${act}` : undefined}
                />
                {q && (
                  <button
                    type="button"
                    className="up-clear"
                    aria-label="清空搜索"
                    onClick={() => {
                      updateQuery('');
                      input.current?.focus();
                    }}
                  >
                    <Icon name="x" />
                  </button>
                )}
                <button type="button" className="cp-x up-desktop-close" aria-label="关闭" onClick={() => close(true)}>
                  <Icon name="x" />
                </button>
              </div>
              <div className="up-controls">
                {validCiv && allowUnavailable && (
                  <div className="up-civ-row">
                    <button
                      type="button"
                      className={'up-civ-toggle' + (onlyAvailable ? ' is-on' : '')}
                      aria-pressed={onlyAvailable}
                      onClick={toggleOnlyAvailable}
                    >
                      <span>{`仅看 ${civZh}可用`}</span>
                      <span className="num nw">{`（${model.availableCount}）`}</span>
                    </button>
                  </div>
                )}
                <div className="up-chips" role="group" aria-label="兵种快捷筛选">
                  <button type="button" className={'up-chip' + (role === '' ? ' is-on' : '')} aria-pressed={role === ''} onClick={() => updateRole('')}>
                    全部
                  </button>
                  {ROLE_KEYS.map((rk) => (
                    <button
                      key={rk}
                      type="button"
                      className={'up-chip' + (role === rk ? ' is-on' : '')}
                      aria-pressed={role === rk}
                      aria-label={rk === 'other' ? UNIT_ROLE_ZH.other : undefined}
                      onClick={() => updateRole(rk)}
                    >
                      {rk === 'other' ? '其他' : UNIT_ROLE_ZH[rk]}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={listRef} className="cp-list up-list" id={lid} role="listbox" aria-label={label} hidden={!model.opts.length} onScroll={onListScroll}>
                {visibleRows.map((row) => {
                  if (row.kind === 'head') {
                    return (
                      <div key={row.key} className="cp-gh up-gh" data-unit-group={row.group} role="presentation">
                        <span>{row.title}</span>
                        <span className="num nw up-gh-cnt">{row.count}</span>
                      </div>
                    );
                  }
                  const { entry, available, matchKind, idx } = row;
                  const sel = entry.u.id === value?.id || (!!value && entry.elite?.id === value.id);
                  const dispAge = displayUnitAge(entry.u.id, entry.u.age, validCiv ?? '');
                  const site = cleanBuildingName(entry.u.bz) || '—';
                  const ageText = AGE_ZH[dispAge] ?? '';
                  const isOwnUnique = Boolean(validCiv && available && entry.u.type === 'UniqueUnit');
                  return (
                    <div
                      key={row.key}
                      id={`${lid}-${idx}`}
                      data-idx={idx}
                      data-unit={entry.u.id}
                      data-available={available ? 'true' : 'false'}
                      role="option"
                      aria-selected={sel}
                      className={'cp-opt up-opt' + (idx === act ? ' act' : '') + (sel ? ' sel' : '') + (available ? '' : ' is-unavail')}
                      onMouseMove={() => setAct(idx)}
                      onClick={() => pick(entry.u)}
                    >
                      <UnitIcon u={entry.u} />
                      <span className="cp-name up-name">
                        <span className="up-main">
                          <span className="up-zh">{formatLabel ? formatLabel(entry.u) : entry.u.zh}</span>
                          {dup.has(entry.u.id) && <span className="civnote">{civNote(entry.u, (en) => civByEn(en)?.zh)}</span>}
                          {entry.elite && <EliteBadge />}
                          {isOwnUnique && <span className="up-badge up-badge-uq">独特单位</span>}
                          {matchKind === 'py' && <span className="up-badge up-badge-py">拼音命中</span>}
                          {!available && civZh && <span className="up-badge up-badge-unavail">{`${civZh}不可用`}</span>}
                        </span>
                        <small className="up-sub">{`${entry.u.en} · ${site}${ageText ? ` · ${ageText}` : ''}`}</small>
                      </span>
                      {sel && <Icon name="check" />}
                    </div>
                  );
                })}
              </div>
              {!model.opts.length && (
                <div className="cp-empty up-empty" role="status">
                  <Icon name="search" className="ic up-empty-ic" />
                  <p>{q.trim() ? `没有找到匹配“${q.trim()}”的单位` : '当前筛选下没有单位'}</p>
                  {hasFilters && <p className="up-empty-hint">当前已启用文明/兵种筛选</p>}
                  {(q || hasFilters) && (
                    <button type="button" className="up-empty-reset" onClick={clearAllFilters}>
                      <Icon name="rotate-ccw" />
                      清除筛选并查看全部
                    </button>
                  )}
                </div>
              )}
              <div className="up-foot">
                <span className="up-foot-count">
                  已显示 <span className="num nw">{`${model.shown} / ${model.total}`}</span> 项
                </span>
                <span className="up-foot-keys">方向键移动 · Enter 选择 · Esc 关闭</span>
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  const triggerText = unavailableText ?? (value ? (formatLabel ? formatLabel(value) : value.zh) : '请选择单位');
  const dataValue = rawValue !== undefined ? String(rawValue) : value?.id !== undefined ? String(value.id) : undefined;
  return (
    <span className="civpick unitpick">
      <button
        ref={btn}
        id={id}
        type="button"
        className="cp-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${label}：${triggerText}`}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        data-value={dataValue}
        onClick={toggleOpen}
      >
        {value && <UnitIcon u={value} />}
        <span className="cp-name">
          {triggerText}
          {value && !unavailableText && <small> {value.en}</small>}
        </span>
        <Icon name="chevron-down" />
      </button>
      {dialog}
    </span>
  );
}
