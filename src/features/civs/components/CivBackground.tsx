import type { CSSProperties, ReactNode } from 'react';
import { civBackground } from '../backgrounds';
import './civ-background.css';

export function CivBackground({ civ, children }: { civ: string; children: ReactNode }) {
  const background = civBackground(civ);
  const style = background ? ({ '--civ-art': 'url("' + background.image + '")' } as CSSProperties) : undefined;
  return (
    <div className={'civ-detail-background' + (background ? ' has-civ-art' : '')} style={style} data-civ-background={background ? civ : undefined}>
      {children}
      {background && (
        <p className="civ-background-credit">
          <a href={background.sourceUrl}>背景插画 · AoE2 Companion</a>
          <span>© Microsoft</span>
        </p>
      )}
    </div>
  );
}
