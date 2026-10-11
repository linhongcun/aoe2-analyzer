/** #42：开局模拟是否完整支持某文明（UI 据此置灰，#39 使用）。规则与数据见 buildSim.ts 的 classifyCivEffect。 */
import eco from '../data/eco.json';
import { buildOrders } from '../data/buildOrders';
import { simSupport as detail, type EcoData } from './buildSim';

const cache = new Map<string, boolean>();
/** civId 用英文 id（如 'Danes'）；'Generic' 视为支持 */
export function simSupport(civId: string): boolean {
  let v = cache.get(civId);
  if (v === undefined) cache.set(civId, (v = detail(eco as unknown as EcoData, civId, buildOrders).supported));
  return v;
}
/** 不支持的原因（中文，可用于提示） */
export const simSupportReasons = (civId: string): string[] => detail(eco as unknown as EcoData, civId, buildOrders).reasons;
