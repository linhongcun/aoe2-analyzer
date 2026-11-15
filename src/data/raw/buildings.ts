/**
 * issue 281：buildings.json 的同步读取入口（登记在 scripts/check-layers.mjs 的 LOADERS 里），原样转出，不做转换。
 * 只能由 src/data/** 内的文件 import（check-layers 的 raw-direct）；
 * 其他层读类型化入口：src/data/core.ts 的 CORE、src/data 的 civs、src/data/eco.ts 的 ECO。
 */
export { default } from '../../../data/game/buildings.json';
