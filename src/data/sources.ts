import pins from '../../scripts/data_sources.json';

/** 当前固定来源的唯一读取入口（issue 801）；历史 review 记录仍保留自己的冻结 pin。 */
export type DataSources = typeof pins;
export type SourcePin = (typeof pins.sources)[keyof typeof pins.sources];

export const DATA_SOURCES: DataSources = pins;
export const SOURCE_PINS = pins.sources;
export const ASSET_SOURCE_PINS = pins.assetSources;
export const DATA_PATCH = pins.patch;
export const DATA_UPDATED = pins.updated;

export const sourceCommitUrl = (pin: SourcePin): string => `https://github.com/${pin.repo}/tree/${pin.commit}/${pin.path}`;

export const sourcePatchNoteUrl = (build: string | number): string => `https://github.com/linhongcun/aoe2-analyzer/blob/main/docs/PATCH-NOTES/${build}.md`;
