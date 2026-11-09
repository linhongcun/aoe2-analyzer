/**
 * 招降机制页面入口：模型已下沉 `src/domain/conversion.ts`，本文件只保留锚点与中文格式。
 */
import { UPDATE_99311 } from '../../domain/conversion';
export * from '../../domain/conversion';

export const CONVERSION_ANCHOR = 'conversion';
export const formatSigned = (value: number) => `${value > 0 ? '+' : ''}${value}`;
export const baselineIntervalText = () => `${UPDATE_99311.intervalMin}–${UPDATE_99311.intervalMax} 秒`;
export const baselineChanceText = () => `${UPDATE_99311.chancePercent}%`;
