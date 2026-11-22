import { useEffect, useState, type RefObject } from 'react';
import { Icon } from '../../../shared/ui/Icon';
import type { DuelSummary } from '../logic/duelSummary';

export interface DuelStickyResultProps {
  summary: DuelSummary | null;
  targetEl: HTMLElement | null;
  headingRef: RefObject<HTMLHeadingElement>;
}

const NARROW_QUERY = '(max-width: 780px)';

/**
 * issue 1279：窄屏（<= 780px）底部实时胜负摘要定位条。
 * 通过 callback ref state 绑定实际挂载的 #duel-res 节点，结果卡因 key 重挂载时自动解绑旧节点并重绑新节点；
 * 仅当结果区尚在视口下方未露出时显示，入屏或滑过至底部/页脚自动隐藏。
 */
export function DuelStickyResult({ summary, targetEl, headingRef }: DuelStickyResultProps) {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY).matches : false,
  );
  const [observed, setObserved] = useState<{ el: HTMLElement; belowViewport: boolean } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_QUERY);
    const sync = () => setIsNarrow(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const hasSummary = Boolean(summary);

  useEffect(() => {
    if (!isNarrow || !targetEl || !hasSummary || typeof IntersectionObserver === 'undefined') return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const rect = targetEl.getBoundingClientRect();
      setObserved({ el: targetEl, belowViewport: rect.top >= window.innerHeight });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    schedule();
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        setObserved({ el: targetEl, belowViewport: !entry.isIntersecting && entry.boundingClientRect.top > 0 });
      },
      { threshold: 0 },
    );
    observer.observe(targetEl);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [isNarrow, targetEl, hasSummary]);

  const visible = Boolean(isNarrow && targetEl && summary && observed?.el === targetEl && observed.belowViewport);
  if (!visible || !summary) return null;

  const jumpToResult = () => {
    if (!targetEl) return;
    const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    targetEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  };

  return (
    <aside className="duel-sticky" data-testid="duel-sticky-result" aria-label="当前对战结果摘要">
      <div className="duel-sticky-copy">
        <p className={`duel-sticky-title w-${summary.winner}`}>
          <Icon name={summary.icon} />
          <strong>{summary.headline}</strong>
        </p>
        <p className="duel-sticky-metrics">
          {summary.metrics.map((metric, index) => (
            <span key={index} className="duel-sticky-metric">
              {metric.prefix}
              {metric.value && <span className="num nw">{metric.value}</span>}
            </span>
          ))}
        </p>
      </div>
      <button type="button" className="duel-sticky-jump" onClick={jumpToResult}>
        看结果
        <Icon name="arrow-down" />
      </button>
    </aside>
  );
}
