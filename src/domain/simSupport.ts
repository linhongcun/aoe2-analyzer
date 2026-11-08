/** #42：开局模拟是否完整支持某文明（UI 据此置灰，#39 使用）。规则与数据见 buildSim.ts 的 classifyCivEffect。 */
import { ECO as eco } from '../data/eco';
import { buildOrders } from '../data/buildOrders';
import { simSupport as detail } from './buildSim';

const cache = new Map<string, boolean>();
/** civId 用英文 id（如 'Danes'）；'Generic' 视为支持 */
export function simSupport(civId: string): boolean {
  let v = cache.get(civId);
  if (v === undefined) cache.set(civId, (v = detail(eco, civId, buildOrders).supported));
  return v;
}
/** 不支持的原因（中文，可用于提示） */
export const simSupportReasons = (civId: string): string[] => detail(eco, civId, buildOrders).reasons;
