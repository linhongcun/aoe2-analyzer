/** #42：开局模拟是否完整支持某文明（UI 据此置灰，#39 使用）。规则与数据见 buildSim.ts 的 classifyCivEffect。 */
import { ECO as eco } from '../data/eco';
import { buildOrders } from '../data/buildOrders';
import { simSupport as detail } from './buildSim';

const cache = new Map<string, boolean>();
const reasonsCache = new Map<string, string[]>();
/** 仅测试构建用：VITE_FORCE_UNSUPPORTED_CIVS=Khmer 时把文明标成不支持；正式构建不设。 */
const forcedEnv =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_FORCE_UNSUPPORTED_CIVS ??
  (typeof process === 'undefined' ? '' : (process.env?.VITE_FORCE_UNSUPPORTED_CIVS ?? ''));
const FORCED_UNSUPPORTED = new Set(String(forcedEnv).split(',').filter(Boolean));
const FORCED_REASON = '测试构建：该文明被强制标记为不支持';

/** civId 用英文 id（如 'Danes'）；'Generic' 视为支持 */
export function simSupport(civId: string): boolean {
  if (FORCED_UNSUPPORTED.has(civId)) return false;
  let v = cache.get(civId);
  if (v === undefined) cache.set(civId, (v = detail(eco, civId, buildOrders).supported));
  return v;
}
/** 不支持的原因（中文，可用于提示）；按文明缓存，避免 UI 每次 render 重跑全量。 */
export const simSupportReasons = (civId: string): string[] => {
  if (FORCED_UNSUPPORTED.has(civId)) return [FORCED_REASON];
  let v = reasonsCache.get(civId);
  if (!v) reasonsCache.set(civId, (v = [...detail(eco, civId, buildOrders).reasons]));
  return [...v];
};
/** UI 摘要：最多 max 条具体原因；空数组时由调用方回退通用句。 */
export const simSupportSummary = (civId: string, max = 2): string[] => simSupportReasons(civId).slice(0, max);
/** 选择器禁用行的一句话原因；取不到时回退现有通用句。 */
export const simSupportNote = (civId: string): string => simSupportSummary(civId, 1)[0] ?? '文明加成尚未计入';
/** 选择器 title/aria 的完整原因；无原因时返回 undefined，由 CivPicker 回退。 */
export const simSupportTitle = (civId: string): string | undefined => simSupportReasons(civId).join('；') || undefined;
/** 链接警告文案：最多两条具体原因，更多时给出总数；无原因时保留逐字通用句。 */
export const supportWarningText = (reasons: readonly string[], civZh: string): string => {
  if (!reasons.length) return `链接里的${civZh}加成尚未计入，已按通用计算。`;
  const shown = reasons.slice(0, 2).join('；');
  return `链接里的${civZh}：${shown}${reasons.length > 2 ? `；等 ${reasons.length} 条` : ''}，已按通用计算。`;
};
export const simSupportWarning = (civId: string, civZh: string): string => supportWarningText(simSupportReasons(civId), civZh);
