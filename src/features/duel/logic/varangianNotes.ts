/**
 * issue 350 / 383：瓦兰吉卫队（2703/2704）在单位 PK 结果卡下的计入标注。
 * 产金数量在 domain/generateResource.ts，按交战时长估算，不在这里重算战斗。
 */
import { formatRatio, varangianListedRatio } from '../../../domain/generateResource';

export type VgStatus = 'counted' | 'uncounted';

export interface VgNote {
  id: string;
  civ: string;
  label: string;
  status: VgStatus;
  reason: string;
}

const VG_IDS = new Set([2703, 2704]);

/** 攻击间隔按结果卡同一口径保留 1 位小数，例如 1.6s。 */
function formatSeconds(rof: number): string {
  return `${Math.round(rof * 10) / 10}s`;
}

/**
 * 一方是瓦兰吉卫队系时，列出本场对该文明生效的相关加成。
 * 其他文明不列出瓦兰吉人专属的攻速与产金。
 * 注：独特科技不在此按时代无条件硬编码（哥瑟砍 1474、后勤学 61 由 duelUnmodeled 按勾选态触发；哈马思克 1484、盾墙 1464 按 issue 1522 移除残留硬编码）。
 */
export function varangianPkNotes(unitId: number, civ: string, age: number, rof?: number, group = false, usesContact = group): VgNote[] {
  if (!VG_IDS.has(unitId)) return [];
  const notes: VgNote[] = [];
  if (civ === 'Varangians') {
    const interval = rof !== undefined && rof > 0 ? ` ${formatSeconds(rof)}` : '';
    notes.push({
      id: 'vg-rof',
      civ,
      label: '攻击速度 +25%',
      status: 'counted',
      reason: `已反映在攻击间隔${interval}`,
    });
    notes.push({
      id: 'vg-gold',
      civ,
      label: '产生的黄金 +50%',
      status: 'counted',
      // 说明文案是 +50%，.dat / UGC 的内部乘法约为 ×1.33。黄金数字见结果卡上的估算。
      reason: `游戏说明写 +50%，数据里约为 ×${formatRatio(varangianListedRatio())}。本场黄金已按这个倍率估算。`,
    });
  } else if (civ === 'Danes') {
    notes.push({
      id: 'danes-spd',
      civ,
      label: '移动速度 +10%',
      status: usesContact ? 'counted' : 'uncounted',
      reason: usesContact ? '已反映在接敌移动速度' : '单挑不计移动速度',
    });
  } else if (civ === 'Vikings' && age >= 2) {
    notes.push({
      id: 'vik-hp',
      civ,
      label: '步兵生命值 +20%',
      status: 'counted',
      reason: '已反映在生命值',
    });
  }
  return notes;
}
