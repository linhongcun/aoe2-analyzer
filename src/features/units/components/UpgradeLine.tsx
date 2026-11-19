import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function UpgradeLine({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);

  useLayoutEffect(() => {
    const host = container.current;
    const line = row.current;
    if (!host || !line) return;
    const measure = () => {
      line.classList.add('is-measuring');
      const naturalWidth = line.getBoundingClientRect().width;
      line.classList.remove('is-measuring');
      setStacked(naturalWidth > host.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    line.querySelectorAll('.ud-node > span').forEach((text) => observer.observe(text));
    return () => observer.disconnect();
  }, [children]);

  return (
    <div className="ud-line-container" ref={container}>
      <div className={`ud-line${stacked ? ' is-stacked' : ''}`} ref={row}>
        {children}
      </div>
    </div>
  );
}
