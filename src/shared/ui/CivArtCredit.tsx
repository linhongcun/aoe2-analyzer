import { CIV_ART_REPO_URL, civBackground } from '../utils/civBackgrounds';
import './civ-art-layer.css';

/** 跨文明复用页底部单一来源署名；仅当页面至少有 1 侧展示有效文明素描时渲染（issue 1313）。 */
export function CivArtCredit({ civs }: { civs: readonly (string | null | undefined)[] }) {
  if (!civs.some((civ) => Boolean(civ && civBackground(civ)))) return null;
  return (
    <p className="civ-art-credit">
      <span>文明背景插画</span>
      {' · '}
      <a href={CIV_ART_REPO_URL}>AoE2 Companion</a>
      {' · '}
      <span>© Microsoft</span>
    </p>
  );
}
