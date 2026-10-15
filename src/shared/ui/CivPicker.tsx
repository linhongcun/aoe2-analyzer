/**
 * 文明选择器（替代原生 <select>，可显示文明图标）。
 * 桌面端为弹出层，窄屏（<900px）为底部抽屉；支持中英文搜索、按资料片分组、键盘导航、
 * 焦点陷阱与 Esc 关闭；可选“无”选项（如“不对比”）与限定可选文明。
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { civByEn, civs } from '../../data';
import { DLCS } from '../../domain/dlc';
import type { Civ } from '../../domain/types';
import { CivIcon, DlcImg } from './art';
import { Icon } from './Icon';
import { Ban, SearchX } from 'lucide-react';

export interface CivPickerProps {
  /** 触发按钮的 id（测试与 label 使用） */
  id: string;
  /** 选中文明英文名；'' 表示“无” */
  value: string;
  onChange: (en: string) => void;
  /** 限定可选文明（英文名）；缺省为全部 */
  allowed?: readonly string[];
  /** 提供“无”选项时的文字，如“不对比” */
  none?: string;
  /** 无障碍标签 */
  label: string;
  /** 选项名称后缀，如“满科技” */
  suffix?: string;
  /** 可选：返回 false 的文明沉到底部「不可选」组，置灰、不可选、键盘跳过 */
  isEnabled?: (en: string) => boolean;
  /** 底部组标题与禁用行小字（配合 isEnabled） */
  disabledGroup?: string;
  disabledNote?: string;
}

/** 文明是否匹配搜索词（ql 已 trim + 小写）；列表过滤与 Enter 共用同一条规则 */
export const civMatches = (c: Pick<Civ, 'zh' | 'en'>, ql: string) => !ql || c.zh.includes(ql) || c.en.toLowerCase().includes(ql);

/**
 * #73 Enter 要选的文明（英文名，'' 为「无」）；返回 undefined 表示什么都不选。
 * live 是输入框里此刻的文字，shown 是当前列表按哪个查询渲染的。两者不一致（过滤还没跑完）时，
 * 不信任旧列表的高亮项，直接按 live 取第一个匹配；一致时取高亮项，但它也必须匹配 live。
 */
export function enterTarget(
  live: string,
  shown: string,
  opts: readonly { en: string; c?: Pick<Civ, 'zh' | 'en'> }[],
  act: number,
  pool: readonly Pick<Civ, 'zh' | 'en'>[],
  hasNone: boolean,
): string | undefined {
  const ql = live.trim().toLowerCase();
  const ok = (o: { en: string; c?: Pick<Civ, 'zh' | 'en'> }) => (o.c ? civMatches(o.c, ql) : hasNone && !ql);
  if (ql === shown.trim().toLowerCase()) {
    const o = opts[act];
    if (o && ok(o)) return o.en;
  }
  if (!ql) return hasNone ? '' : pool[0]?.en;
  return pool.find((c) => civMatches(c, ql))?.en;
}

type Row =
  { kind: 'head'; key: string; dlc: number | null; title: string } | { kind: 'opt'; key: string; en: string; c?: Civ } | { kind: 'dis'; key: string; c: Civ };

export function CivPicker({ id, value, onChange, allowed, none, label, suffix, isEnabled, disabledGroup, disabledNote }: CivPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const cur = value ? civByEn(value) : undefined;
  const all = useMemo(() => (allowed ? civs.filter((c) => allowed.includes(c.en)) : civs), [allowed]);
  const pool = useMemo(() => (isEnabled ? all.filter((c) => isEnabled(c.en)) : all), [all, isEnabled]);
  const off = useMemo(() => (isEnabled ? all.filter((c) => !isEnabled(c.en)) : []), [all, isEnabled]);

  const rows: Row[] = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out: Row[] = [];
    // 不可选的文明统一沉底成一组（搜索时也保留），不进入键盘可达的 opts
    const tail = () => {
      const hit = off.filter((c) => civMatches(c, ql));
      if (!hit.length) return;
      out.push({ kind: 'head', key: 'h-off', dlc: null, title: disabledGroup ?? '暂不可选' });
      hit.forEach((c) => out.push({ kind: 'dis', key: 'off-' + c.en, c }));
    };
    if (none && !ql) out.push({ kind: 'opt', key: '__none', en: '' });
    if (ql) {
      pool.filter((c) => civMatches(c, ql)).forEach((c) => out.push({ kind: 'opt', key: c.en, en: c.en, c }));
      tail();
      return out;
    }
    const groups = new Map<number | null, Civ[]>();
    pool.forEach((c) => groups.set(c.dlc, [...(groups.get(c.dlc) ?? []), c]));
    [...groups.entries()]
      .sort((a, b) => (a[0] ?? 99) - (b[0] ?? 99))
      .forEach(([d, cs]) => {
        out.push({ kind: 'head', key: 'h' + d, dlc: d, title: d == null ? '其他' : `${DLCS[d]!.zh} · ${DLCS[d]!.year}` });
        cs.forEach((c) => out.push({ kind: 'opt', key: c.en, en: c.en, c }));
      });
    tail();
    return out;
  }, [q, pool, off, none, disabledGroup]);
  const opts = rows.filter((r): r is Extract<Row, { kind: 'opt' }> => r.kind === 'opt');

  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 0);
    const onDoc = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    // Esc 在焦点尚未进入弹层时也能关闭
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !panel.current?.contains(document.activeElement)) {
        setOpen(false);
        setQ('');
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  useEffect(() => {
    if (open) panel.current?.querySelector(`[data-idx="${act}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [act, open]);

  const close = () => {
    setOpen(false);
    setQ('');
    btn.current?.focus();
  };
  const pick = (en: string) => {
    onChange(en);
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAct((a) => Math.min(opts.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAct((a) => Math.max(0, a - 1));
    } else if (e.key === 'Home') {
      setAct(0);
    } else if (e.key === 'End') {
      setAct(opts.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // #73 以输入框此刻的文字为准，过滤没跑完时不选未匹配的文明
      const en = enterTarget(input.current?.value ?? q, q, opts, act, pool, !!none);
      if (en !== undefined) pick(en);
    } else if (e.key === 'Tab') {
      // 焦点陷阱：在弹层内循环
      const f = [...(panel.current?.querySelectorAll<HTMLElement>('input,button') ?? [])];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i === f.length - 1 ? 0 : i + 1;
      e.preventDefault();
      f[n]!.focus();
    }
  };

  let idx = -1;
  return (
    <span className="civpick">
      <button
        ref={btn}
        id={id}
        type="button"
        className="cp-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}：${cur ? cur.zh : (none ?? '未选择')}`}
        data-value={value}
        onClick={() => {
          if (open) return close();
          const i = opts.findIndex((o) => o.en === value);
          setAct(i < 0 ? 0 : i);
          setOpen(true);
        }}
      >
        {cur ? <CivIcon c={cur} /> : <span className="cp-noico" />}
        <span className="cp-name">
          {cur ? cur.zh : none}
          {cur && <small> {cur.en}</small>}
        </span>
        <Icon name="chevron-down" />
      </button>
      {open && (
        <>
          <div className="cp-mask" onClick={close} />
          <div ref={panel} className="cp-panel" role="dialog" aria-modal="true" aria-label={label} onKeyDown={onKey}>
            <div className="cp-head">
              <Icon name="search" />
              <input
                ref={input}
                className="cp-q"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setAct(0);
                }}
                placeholder="搜索文明（中/英）"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={opts[act] ? `${listId}-${act}` : undefined}
              />
              <button type="button" className="cp-x" aria-label="关闭" onClick={close}>
                <Icon name="x" />
              </button>
            </div>
            <div className="cp-list" id={listId} role="listbox" aria-label={label}>
              {rows.map((r) => {
                if (r.kind === 'head')
                  return (
                    <div key={r.key} className="cp-gh" role="presentation">
                      {r.dlc != null && <DlcImg i={r.dlc} className="cp-dlc" />}
                      {r.title}
                    </div>
                  );
                if (r.kind === 'dis') {
                  const tip = `${r.c.zh}：${disabledNote ?? '暂不可选'}，暂不能选`;
                  return (
                    <div
                      key={r.key}
                      className="cp-opt dis"
                      role="option"
                      aria-selected={false}
                      aria-disabled="true"
                      data-civ={r.c.en}
                      title={tip}
                      aria-label={tip}
                    >
                      <CivIcon c={r.c} />
                      <span className="cp-name">
                        {r.c.zh}
                        <small>{r.c.en}</small>
                        {disabledNote && <small className="cp-dis-note">{disabledNote}</small>}
                      </span>
                      <Ban size={16} aria-hidden />
                    </div>
                  );
                }
                idx++;
                const i = idx;
                const sel = r.en === value;
                return (
                  <div
                    key={r.key}
                    id={`${listId}-${i}`}
                    data-idx={i}
                    data-civ={r.en || '__none'}
                    role="option"
                    aria-selected={sel}
                    className={'cp-opt' + (i === act ? ' act' : '') + (sel ? ' sel' : '') + (r.c ? '' : ' none')}
                    onMouseMove={() => setAct(i)}
                    onClick={() => pick(r.en)}
                  >
                    {r.c ? <CivIcon c={r.c} /> : <span className="cp-noico" />}
                    <span className="cp-name">
                      {r.c ? r.c.zh : none}
                      {r.c && <small>{r.c.en}</small>}
                      {r.c && suffix && <small className="cp-suf">{suffix}</small>}
                    </span>
                    {sel && <Icon name="check" />}
                  </div>
                );
              })}
              {!rows.some((r) => r.kind !== 'head') && (
                <div className="cp-empty" role="status">
                  <SearchX size={24} aria-hidden />
                  <p>没有找到“{q.trim()}”</p>
                  <p className="cp-hint">可以试试英文名</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
