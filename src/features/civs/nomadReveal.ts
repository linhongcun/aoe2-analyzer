/**
 * issue 758：越南文明详情里的游牧定位与揭示边界。
 * 只挂越南。原文和团队加成从 civs.json 读出。
 * 游牧完工时点是社区说法，当前版本待确认，本站未实测。
 */
import { civByEn } from '../../data';

export const NOMAD_REVEAL_CIV = 'Vietnamese';
export const NOMAD_REVEAL_EN = 'Enemy Town Centers are revealed at the start of the game';
export const NOMAD_REVEAL_CHECKED = '2026-11-07';
export const NOMAD_REVEAL_UPDATE = '73855';

export const NOMAD_REVEAL_HREFS = {
  fextralife: 'https://ageofempires2.wiki.fextralife.com/Vietnamese',
  fandom: 'https://ageofempires.fandom.com/wiki/Vietnamese',
  strategy: 'https://ageofempires.fandom.com/wiki/Vietnamese/Strategy',
  liquipedia: 'https://liquipedia.net/ageofempires/Nomad',
  update: 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-73855/',
} as const;

/** 这些词一旦出现，说明写成了未授权的揭示范围。卡片改为不显示。 */
export const NOMAD_REVEAL_FORBIDDEN = ['村民', '侦察兵', '全体敌军', '全图', '实时视野', '地基', '新建', '重建', '市场', '实测通过', '开局脚本'] as const;

type Part = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'num'; readonly text: string };
type Chunk = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'nw'; readonly parts: readonly Part[] };

export interface NomadRevealLine {
  readonly id: string;
  readonly label: string;
  readonly parts: readonly Chunk[];
  readonly pending?: boolean;
}

export interface NomadRevealNote {
  readonly id: string;
  readonly text: string;
}

export interface NomadRevealLink {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly external?: boolean;
}

export interface NomadReveal {
  readonly civ: typeof NOMAD_REVEAL_CIV;
  readonly bonusIndex: number;
  readonly title: '游牧定位与揭示边界';
  readonly summary: string;
  readonly lines: readonly NomadRevealLine[];
  readonly notes: readonly NomadRevealNote[];
  readonly links: readonly NomadRevealLink[];
}

export interface NomadRevealCiv {
  readonly en: string;
  readonly bon: readonly string[];
  readonly bonEn: readonly string[];
  readonly tb: string;
  readonly tbEn: string;
}

const words = (text: string): Chunk => ({ kind: 'text', text });
const nw = (...parts: readonly Part[]): Chunk => ({ kind: 'nw', parts });
const num = (text: string): Part => ({ kind: 'num', text });

export function nomadRevealLineText(line: NomadRevealLine): string {
  return line.parts.map((part) => (part.kind === 'text' ? part.text : part.parts.map((item) => item.text).join(''))).join('');
}

export function nomadRevealText(card: NomadReveal): string {
  return [
    card.title,
    card.summary,
    ...card.lines.map(nomadRevealLineText),
    ...card.notes.map((note) => note.text),
    ...card.links.map((link) => link.label),
  ].join('\n');
}

function allowed(card: NomadReveal): boolean {
  const text = nomadRevealText(card);
  return NOMAD_REVEAL_FORBIDDEN.every((word) => !text.includes(word));
}

export function nomadRevealFor(civ: NomadRevealCiv | undefined): NomadReveal | null {
  if (!civ || civ.en !== NOMAD_REVEAL_CIV) return null;
  if (civ.bon.length !== civ.bonEn.length) return null;
  const bonusIndex = civ.bonEn.indexOf(NOMAD_REVEAL_EN);
  if (bonusIndex < 0) return null;
  const site = civ.bon[bonusIndex]?.trim();
  const team = civ.tb.trim();
  const teamEn = civ.tbEn.trim();
  if (!site || !team || !teamEn) return null;
  const card: NomadReveal = {
    civ: NOMAD_REVEAL_CIV,
    bonusIndex,
    title: '游牧定位与揭示边界',
    summary:
      '显示敌方初始城镇中心位置，有助于在游牧等地图定位对手、规划进攻与团队协同。该效果属于文明加成，不是团队加成；并非揭示敌方初始单位，也不代表获得敌军持续视野。',
    lines: [
      { id: 'site', label: '本站原文', parts: [words(site)] },
      { id: 'site-en', label: '英文原文', parts: [words(NOMAD_REVEAL_EN)] },
      { id: 'kind', label: '归属', parts: [words('文明加成')] },
      { id: 'team', label: '团队加成', parts: [words(team)] },
      { id: 'team-en', label: '团队加成英文', parts: [words(teamEn)] },
      { id: 'target', label: '揭示对象', parts: [words('敌方初始城镇中心位置')] },
      { id: 'nomad', label: '游牧时点', parts: [words('社区依据，当前版本待确认')], pending: true },
      { id: 'share', label: '团队共享', parts: [words('须开启共享探索或共享视野')] },
      { id: 'patch', label: '官方更新', parts: [nw({ kind: 'text', text: 'Update ' }, num(NOMAD_REVEAL_UPDATE))] },
      { id: 'checked', label: '核对日期', parts: [nw(num(NOMAD_REVEAL_CHECKED))] },
    ],
    notes: [
      {
        id: 'share',
        text: '团队协同以开启共享探索或共享视野为前提。上表的官方更新写明，共享视野在匹配模式和大厅对局里默认开启。这是通用设置，不是越南专属细则。自定义设置仍可能不同。',
      },
      {
        id: 'nomad',
        text: '社区资料把游牧写成开局没有城镇中心，并称敌方首座城镇中心完工后才显示位置。这和上表本站原文不是同一句已验证结论。当前版本待确认，本站未实测。',
      },
      {
        id: 'wider',
        text: '另有社区说法写成每座敌方城镇中心。本说明只采用初始位置，更宽范围待确认。',
      },
    ],
    links: [
      { id: 'civ-bonus', href: `/civ/${NOMAD_REVEAL_CIV}/bonus/${bonusIndex}`, label: '本站文明加成' },
      { id: 'team-bonus', href: `/civ/${NOMAD_REVEAL_CIV}/bonus/team`, label: '本站团队加成' },
      { id: 'fextralife', href: NOMAD_REVEAL_HREFS.fextralife, label: 'Fextralife 越南', external: true },
      { id: 'fandom', href: NOMAD_REVEAL_HREFS.fandom, label: 'Fandom 越南', external: true },
      { id: 'strategy', href: NOMAD_REVEAL_HREFS.strategy, label: '越南策略说明', external: true },
      { id: 'liquipedia', href: NOMAD_REVEAL_HREFS.liquipedia, label: 'Liquipedia 游牧', external: true },
      { id: 'update', href: NOMAD_REVEAL_HREFS.update, label: '官方共享视野说明', external: true },
    ],
  };
  return allowed(card) ? card : null;
}

export function nomadReveal(en: string): NomadReveal | null {
  const civ = civByEn(en);
  if (!civ) return null;
  return nomadRevealFor(civ);
}
