/**
 * #19 分享卡（v0.4，Jony SPEC：docs/design/mockups/issue19/share-card/SPEC.md @ design/jony-archive）。
 * 原则：卡片不自己算，和页面用同一套函数——rangeLabel（#56）、pickSummaryBottleneck + summaryText（#57）、formatClock。
 * 纯函数，不碰 DOM；数字全部来自 simulateBuild → buildView。
 */
import { formatClock } from '../../domain/formatTime';
import { MAYAN_CAVALRY_TEMPLATE_NOTE, SHU_KNIGHT_TEMPLATE_NOTE } from '../../domain/buildSim';
import { WEI_KNIGHT_TEMPLATE_NOTE } from '../../domain/weiEconomy';
import { BENGALI_KNIGHT_TEMPLATE_NOTE } from '../../domain/bengaliEconomy';
import { ARMENIAN_CART_NOTE, ARMENIAN_RESEARCH_NOTE } from '../../domain/armenianEconomy';
import { GEORGIAN_CART_NOTE, GEORGIAN_START_NOTE } from '../../domain/georgianEconomy';
import { RES_ZH, rangeLabel, summaryParts, summaryText, type AgeMark, type TimelineView } from './timelineModel';

export interface ShareCell {
  label: string;
  value: string;
  /** 琥珀强调（最多 2 处：格 1、格 2 主值） */
  accent: boolean;
  /** 次行；null → 整行不渲染（不留空行、不写「—」） */
  sub: string | null;
  /** 主值分段（#78 第 7 项）：预览只在段与段之间断行；value 仍是拼接后的整串（标题、aria、PNG 用） */
  valueParts?: string[];
}
export interface ShareCardModel {
  title: string;
  cells: [ShareCell, ShareCell, ShareCell];
  basis: string;
  site: string;
  kind: string;
  url: string;
}
export interface ShareInput {
  view: TimelineView;
  /** 目标时代的到达标记（页面摘要用的同一个）；没到达为 undefined */
  target: AgeMark | undefined;
  boId: string;
  boNameZh: string;
  civEn: string;
  civZh: string;
  /** 目标时代中文（封建/城堡/帝王） */
  targetZh: string;
  dist: number;
  defaultDist: number;
  house: boolean;
  patchBuild: number | string;
  /** 站点根，如 linhongcun.github.io/aoe2-analyzer/（不含协议） */
  siteRoot: string;
}

export const SHARE_SITE = '帝国时代 II 分析器';
/** 置灰文明（simSupport=false）旁边的说明，逐字（Steve 定） */
export const SHARE_DISABLED_NOTE = '加成未计入，暂不能生成分享卡';

/** 结论句里的开局名：去掉末尾括号补充（「速升城堡暴经济（23+2）」→「速升城堡暴经济」，与 Jony 样稿一致） */
export const shortBoName = (zh: string) => zh.replace(/\s*[（(][^（）()]*[）)]\s*$/, '');

/** 能还原同一设置的深链；dist / house 非默认时才追加 */
export function shareUrl(i: Pick<ShareInput, 'siteRoot' | 'boId' | 'civEn' | 'dist' | 'defaultDist' | 'house'>): string {
  const q = [...(i.civEn ? [`civ=${encodeURIComponent(i.civEn)}`] : [])];
  if (i.dist !== i.defaultDist) q.push(`dist=${i.dist}`);
  if (!i.house) q.push('house=0');
  return `${i.siteRoot.replace(/\/?$/, '/')}builds/${encodeURIComponent(i.boId)}/${q.length ? '?' + q.join('&') : ''}`;
}

export function buildShareCard(i: ShareInput): ShareCardModel {
  const v = i.view;
  const target = i.target;
  const top = v.top;
  const sum = summaryText(top, i.targetZh);
  const parts = summaryParts(top, i.targetZh);
  const reached = !!target && !v.timeout;
  const phrase = !top
    ? '全程不卡'
    : top.type === 'pop_block'
      ? '卡人口'
      : top.type === 'timeout'
        ? sum.main
        : top.type === 'resource_short' && top.resource
          ? `卡在${RES_ZH[top.resource]}`
          : sum.main.replace(/ 约 .*$/, '');
  const head = `${i.civZh}·${shortBoName(i.boNameZh)}`;
  const title = reached ? `${head}，约 ${formatClock(target!.reachAt)} 到${i.targetZh}，${phrase}` : `${head}，60 分钟内到不了${i.targetZh}`;
  return {
    title,
    cells: [
      {
        label: `到达${i.targetZh}`,
        value: reached ? `约 ${formatClock(target!.reachAt)}` : '未到',
        accent: reached,
        sub: reached ? rangeLabel(target!.reachAt, target!.errSec) : null,
      },
      {
        label: '主要卡点',
        value: sum.main,
        accent: !!top,
        sub: sum.sub || null,
        valueParts: parts.time ? [parts.reason, parts.time] : [parts.reason],
      },
      { label: '城镇中心闲置', value: `约 ${formatClock(v.tcIdleTotal)}`, accent: false, sub: null },
    ],
    basis:
      [`按${i.civZh}计`, `走路 ${i.dist} 格`, ...(i.house ? [] : ['关自动建房']), `游戏版本 ${i.patchBuild}`].join(' · ') +
      (i.civEn === 'Shu' && i.boId === 'fast-castle-knights' ? `\n${SHU_KNIGHT_TEMPLATE_NOTE}` : '') +
      (i.civEn === 'Mayans' && ['scouts-18', 'fast-castle-knights'].includes(i.boId) ? `\n${MAYAN_CAVALRY_TEMPLATE_NOTE}` : '') +
      (i.civEn === 'Wei' ? '\n经济研究完成赠村民，按开局任务分配\n满住房仍计入赠送；该住房政策未经当前版本客户端实测\n出生位置、集结与驻扎未模拟' : '') +
      (i.civEn === 'Wei' && i.boId === 'fast-castle-knights' ? `\n${WEI_KNIGHT_TEMPLATE_NOTE}` : '') +
      (i.civEn === 'Bengalis'
        ? '\n到达新时代时，每座完成城镇中心赠送2个村民\n满住房仍计入赠送；该住房政策未经当前版本客户端实测\n出生位置、集结与驻扎未模拟'
        : '') +
      (i.civEn === 'Bengalis' && i.boId === 'fast-castle-knights' ? `\n${BENGALI_KNIGHT_TEMPLATE_NOTE}` : '') +
      (i.civEn === 'Armenians' ? `\n${ARMENIAN_CART_NOTE}\n${ARMENIAN_RESEARCH_NOTE}` : '') +
      (i.civEn === 'Georgians' ? `\n${GEORGIAN_START_NOTE}\n${GEORGIAN_CART_NOTE}` : ''),
    site: SHARE_SITE,
    kind: '开局时间线',
    url: shareUrl(i),
  };
}
