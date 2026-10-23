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
 * 其他文明不列出瓦兰吉人专属的攻速、产金和哥瑟砍。
 */
export function varangianPkNotes(unitId: number, civ: string, age: number, rof?: number): VgNote[] {
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
    if (age >= 4) {
      notes.push({
        id: 'vg-gothikon',
        civ,
        label: '哥瑟砍（定期投掷斧头）',
        status: 'uncounted',
        reason: '定期投斧不计入单位 PK',
      });
    }
  } else if (civ === 'Byzantines' && age >= 4) {
    notes.push({
      id: 'byz-logistica',
      civ,
      label: '后勤学（践踏伤害）',
      status: 'uncounted',
      reason: '践踏伤害不计入单位 PK',
    });
  } else if (civ === 'Danes') {
    notes.push({
      id: 'danes-spd',
      civ,
      label: '移动速度 +10%',
      status: 'uncounted',
      reason: '单位 PK 不计移动速度',
    });
    if (age >= 3) {
      notes.push({
        id: 'danes-hamask',
        civ,
        label: '哈马思克（失去生命值时可造成更多伤害）',
        status: 'uncounted',
        reason: '特殊能力不计入单位 PK',
      });
    }
  } else if (civ === 'Saxons' && age >= 4) {
    notes.push({
      id: 'sax-shield',
      civ,
      label: '盾墙（成群时额外护甲）',
      status: 'uncounted',
      reason: '特殊能力不计入单位 PK',
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
