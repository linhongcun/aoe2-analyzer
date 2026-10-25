import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { civs } from '../../data';
import type { BuildOrder } from '../../domain/buildOrder';
import { parseQuery } from './timelineModel';

/** 开局设置的URL、会话提示和手机抽屉；模拟与坐标计算由调用方负责。 */
export function useTimelineSettings(orders: BuildOrder[]) {
  const [sp, setSp] = useSearchParams();
  const q = parseQuery(
    sp,
    orders.map((b) => b.id),
    civs.map((c) => c.en),
    (id) => orders.find((b) => b.id === id)?.steps.length ?? 0,
  );
  const bo = orders.find((b) => b.id === q.bo)!;
  const patch = (kv: Record<string, string | null>) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(kv)) {
          if (v === null) n.delete(k);
          else n.set(k, v);
        }
        return n;
      },
      { replace: true },
    );
  const set = (k: string, v: string | null) => patch({ [k]: v });
  const [warnOff, setWarnOff] = useState(() => sessionStorage.getItem('tl-civwarn-off') === '1');
  const [hintOff, setHintOff] = useState(() => sessionStorage.getItem('tl-followup-off') === '1');
  const [showAssume, setShowAssume] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const setBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const close = () => {
    setDrawer(false);
    setBtn.current?.focus();
  };
  useEffect(() => {
    if (!drawer) return;
    sheet.current?.querySelector<HTMLElement>('button, input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.tl-chips [aria-checked="true"]');
    const row = el?.parentElement;
    if (el && row) row.scrollLeft = el.offsetLeft - row.offsetLeft - 8;
  }, [bo.id]);

  const hideWarning = () => {
    sessionStorage.setItem('tl-civwarn-off', '1');
    setWarnOff(true);
  };
  const hideHint = () => {
    sessionStorage.setItem('tl-followup-off', '1');
    setHintOff(true);
  };
  return { sp, q, bo, patch, set, warnOff, hideWarning, hintOff, hideHint, showAssume, setShowAssume, drawer, setDrawer, setBtn, sheet, close };
}
