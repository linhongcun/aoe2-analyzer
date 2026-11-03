import manifest from './backgrounds.json';

const images = import.meta.glob('./assets/backgrounds/*.webp', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>;
type BackgroundAsset = (typeof manifest.assets)[keyof typeof manifest.assets];
const assets: Readonly<Record<string, BackgroundAsset | undefined>> = manifest.assets;

/** 仅返回已核实的文明映射；URL交由Vite处理部署子路径，图像按当前文明请求。 */
export function civBackground(civ: string) {
  const asset = assets[civ];
  if (!asset) return undefined;
  const image = images['./assets/backgrounds/' + asset.file];
  if (!image) return undefined;
  return {
    image,
    width: asset.width,
    height: asset.height,
    sourceUrl: 'https://github.com/' + manifest.repo + '/blob/' + manifest.commit + '/' + asset.sourcePath,
  };
}
