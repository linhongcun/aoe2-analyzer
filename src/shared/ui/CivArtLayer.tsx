import type { CSSProperties } from 'react';
import { civBackground, type CivBackgroundInfo } from '../utils/civBackgrounds';
import './civ-art-layer.css';

interface CivArtLayerProps {
  civ?: string | null;
  side: 'a' | 'b';
  variant?: 'card' | 'head-band';
  mirror?: boolean;
  muted?: boolean;
}

/**
 * 阵营头卡内的文明素描氛围层（issue 1313）。
 * 必须作为 `.civ-art-host` 的首个子元素渲染，依靠 CSS 绘制序自然位于底色之上、正文与弹层之下。
 */
export function CivArtLayer({ civ, side, variant = 'card', mirror = false, muted = false }: CivArtLayerProps) {
  const background: CivBackgroundInfo | undefined = civ ? civBackground(civ) : undefined;
  if (!background) return null;
  const classes = ['civ-art-clip', variant === 'head-band' ? 'is-head-band' : '', muted ? 'is-muted' : ''].filter(Boolean).join(' ');
  const style = { '--civ-art-url': `url("${background.image}")` } as CSSProperties;
  return (
    <div
      className={classes}
      aria-hidden="true"
      data-civ-art={civ ?? undefined}
      data-side={side}
      data-ratio={background.ratio}
      data-mirror={mirror ? 'true' : undefined}
    >
      <div className="civ-art-glow" />
      <div className="civ-art-mask">
        <div className="civ-art-img" style={style} />
      </div>
    </div>
  );
}
