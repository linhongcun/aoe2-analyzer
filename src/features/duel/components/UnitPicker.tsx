/** 单位选择器：图标 + 名称，搜索（中/英），一个家族一条（精锐在外部切换），键盘导航与 Esc */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { FamilyEntry } from '../../../domain/family';
import type { Unit } from '../../../domain/types';
import { EliteBadge, UnitIcon } from '../../../shared/ui/art';
import { Icon } from '../../../shared/ui/Icon';
import { civNote, dupIdsIn } from '../../../domain/dupNames';
import { civByEn } from '../../../data';

export function UnitPicker({ id, value, list, onChange, label }: { id: string; value: Unit; list: FamilyEntry[]; onChange: (u: Unit) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const lid = useId();
  const opts = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return list;
    const m = (u?: Unit) => !!u && (u.zh.includes(ql) || u.en.toLowerCase().includes(ql));
    return list.filter((x) => m(x.u) || m(x.elite));
  }, [q, list]);
  // #44 同名单位同时出现在选项里时加文明小字
  const dup = useMemo(() => dupIdsIn(opts.map((x) => x.u)), [opts]);
  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 0);
    const onDoc = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close();
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
  function close() {
    setOpen(false);
    setQ('');
    btn.current?.focus();
  }
  const pick = (u: Unit) => {
    onChange(u);
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAct((a) => Math.min(opts.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAct((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (opts[act]) pick(opts[act]!.u);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      input.current?.focus();
    }
  };
  return (
    <span className="civpick">
      <button
        ref={btn}
        id={id}
        type="button"
        className="cp-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}：${value.zh}`}
        data-value={value.id}
        onClick={() => {
          if (open) return close();
          const i = list.findIndex((x) => x.u.id === value.id || x.elite?.id === value.id);
          setAct(i < 0 ? 0 : i);
          setOpen(true);
        }}
      >
        <UnitIcon u={value} />
        <span className="cp-name">
          {value.zh}
          <small> {value.en}</small>
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
                placeholder="搜索单位（中/英）"
                role="combobox"
                aria-expanded="true"
                aria-controls={lid}
                aria-activedescendant={opts[act] ? `${lid}-${act}` : undefined}
              />
              <button type="button" className="cp-x" aria-label="关闭" onClick={close}>
                <Icon name="x" />
              </button>
            </div>
            <div className="cp-list" id={lid} role="listbox" aria-label={label}>
              {opts.map((x, i) => {
                const sel = x.u.id === value.id || x.elite?.id === value.id;
                return (
                  <div
                    key={x.u.id}
                    id={`${lid}-${i}`}
                    data-idx={i}
                    data-unit={x.u.id}
                    role="option"
                    aria-selected={sel}
                    className={'cp-opt' + (i === act ? ' act' : '') + (sel ? ' sel' : '')}
                    onMouseMove={() => setAct(i)}
                    onClick={() => pick(x.u)}
                  >
                    <UnitIcon u={x.u} />
                    <span className="cp-name">
                      <span>
                        {x.u.zh}
                        {dup.has(x.u.id) && <span className="civnote">{civNote(x.u, (en) => civByEn(en)?.zh)}</span>}
                        {x.elite && <EliteBadge />}
                      </span>
                      <small>{x.u.en}</small>
                    </span>
                    {sel && <Icon name="check" />}
                  </div>
                );
              })}
              {!opts.length && <p className="note cp-empty">没有匹配的单位</p>}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
