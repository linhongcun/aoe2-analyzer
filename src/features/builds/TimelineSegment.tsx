import { useEffect, useRef, useState } from 'react';
import { mmss, type Seg } from './timelineModel';

export function TimelineSegment({ segment, row, selected, left, width }: { segment: Seg; row: string; selected: boolean; left: string; width: string }) {
  const bar = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(false);

  useEffect(() => {
    let active = true;
    const measure = () => {
      if (!active || !bar.current || !label.current) return;
      const style = getComputedStyle(bar.current);
      const available = bar.current.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setFits(available > 0 && label.current.getBoundingClientRect().width <= available);
    };
    const observer = new ResizeObserver(measure);
    if (bar.current) observer.observe(bar.current);
    measure();
    window.addEventListener('resize', measure);
    document.fonts.addEventListener('loadingdone', measure);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener('resize', measure);
      document.fonts.removeEventListener('loadingdone', measure);
    };
  }, [segment.label, selected, left, width]);

  return (
    <span
      ref={bar}
      role="listitem"
      className={`tl-bar k-${segment.kind}${selected ? ' is-sel' : ''}`}
      style={{ left, width }}
      title={`${segment.label} · 约 ${mmss(segment.from)}–${mmss(segment.to)}`}
      aria-label={`${row} ${segment.label} 约 ${mmss(segment.from)} 到 ${mmss(segment.to)}`}
    >
      <span ref={label} className="tl-bar-label" aria-hidden="true" style={{ visibility: fits ? 'visible' : 'hidden' }}>
        {segment.label}
      </span>
    </span>
  );
}
