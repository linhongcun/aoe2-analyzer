/**
 * issue 281：civs.json 的同步读取入口（登记在 scripts/check-layers.mjs 的 LOADERS 里），原样转出，不做转换。
 * 核心 JSON 只能经 LOADERS 里的文件读取：同步读原始数据从 src/data/raw/ 取；
 * 异步拆包与带派生字段（dlc 等）的数据走 src/data/index.ts。
 */
export { default } from '../civs.json';
