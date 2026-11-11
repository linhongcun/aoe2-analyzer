import catalog from '../../data/mapCatalog.json';

/** 地图目录里 Arabia 的中文名。开局 `map` 只做资料展示，不作为筛选。 */
const ARABIA_ZH = catalog.maps.find((map) => map.en === 'Arabia')?.name;

/** 英文 Arabia 换成地图目录已有译名；其余原文保留（含「Arabia / 封闭地图」里的中文部分）。 */
export function displayBuildMap(map: string): string {
  if (!ARABIA_ZH) return map;
  return map.replaceAll('Arabia', ARABIA_ZH);
}
