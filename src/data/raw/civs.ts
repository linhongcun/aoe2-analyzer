/**
 * issue 281：civs.json 的同步读取入口（原样转出，不做任何转换）。
 * src/domain、src/features 不直接 import 核心数据 JSON，需要同步拿原始数据时从这里取；
 * 需要带 dlc 等派生字段的数据仍走 src/data/index.ts（civs / loadCore / loadTrees）。
 */
export { default } from '../civs.json';
