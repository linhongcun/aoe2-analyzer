import manifest from '../../../data/reference/civs/backgrounds.json';

const WIDE_RATIO = 1.3;
const images = import.meta.glob('../assets/civ-backgrounds/*.webp', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>;
type BackgroundAsset = (typeof manifest.assets)[keyof typeof manifest.assets];
const assets: Readonly<Record<string, BackgroundAsset | undefined>> = manifest.assets;

export const CIV_ART_REPO_URL = 'https://github.com/' + manifest.repo;

export interface CivBackgroundInfo {
  image: string;
  width: number;
  height: number;
  ratio: 'square' | 'wide';
  sourceUrl: string;
}

/** 仅返回已核实的文明映射；URL 交由 Vite 处理部署子路径，图像按当前文明按需请求。 */
export function civBackground(civ: string): CivBackgroundInfo | undefined {
  const asset = assets[civ];
  if (!asset) return undefined;
  const image = images['../assets/civ-backgrounds/' + asset.file];
  if (!image) return undefined;
  return {
    image,
    width: asset.width,
    height: asset.height,
    ratio: asset.width / asset.height >= WIDE_RATIO ? 'wide' : 'square',
    sourceUrl: CIV_ART_REPO_URL + '/blob/' + manifest.commit + '/' + asset.sourcePath,
  };
}

/** 仅当数组去重后恰好包含唯一 1 个有效文明时返回该文明；空选、无效或多文明统一返回 undefined。 */
export function resolveSideArtCiv(civs: readonly (string | null | undefined)[]): string | undefined {
  const unique = new Set<string>();
  for (const civ of civs) {
    const trimmed = civ?.trim();
    if (trimmed) unique.add(trimmed);
  }
  if (unique.size !== 1) return undefined;
  const [only] = unique;
  return only && civBackground(only) ? only : undefined;
}
