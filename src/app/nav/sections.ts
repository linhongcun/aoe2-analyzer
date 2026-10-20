import { unitCountLabel } from '../../domain/family';
import type { IconName } from '../../shared/ui/Icon';

/** 信息架构：导航分组与模块注册表（新增模块只需在这里登记 + routes.tsx 注册路由） */
export interface Section {
  key: string;
  path: string;
  label: string;
  en: string;
  icon: IconName;
  desc: string;
  /** 当前路径是否属于该模块（用于高亮与面包屑） */
  match: RegExp;
  status?: 'planned';
  /** 不在顶部导航显示（首页与 Ctrl+K 仍可达），避免导航换行 */
  hideNav?: boolean;
}
export const WIKI: Section[] = [
  {
    key: 'glossary',
    path: '/glossary',
    label: '术语与缩写',
    en: 'Glossary',
    icon: 'scroll',
    desc: '看懂社区缩写、开局用语与加成措辞',
    match: /^\/glossary(\/.*)?$/,
    hideNav: true,
  },
  { key: 'maps', path: '/maps', label: '地图', en: 'Maps', icon: 'map', desc: '阿拉伯、竞技场、游牧和海图的资源与开局', match: /^\/maps$/, hideNav: true },
  {
    key: 'civs',
    path: '/civs',
    label: '文明',
    en: 'Civilizations',
    icon: 'shield',
    desc: '56 个文明的定位、加成、评分与团战位置',
    match: /^\/(civs|civ\/.*)$/,
  },
  {
    key: 'units',
    path: '/units',
    label: '单位',
    en: 'Units',
    icon: 'users',
    desc: `${unitCountLabel(__UNIT_COUNT__)}的属性、克制与升级路线`,
    match: /^\/units?(\/.*)?$/,
  },
  {
    key: 'buildings',
    path: '/buildings',
    label: '建筑',
    en: 'Buildings',
    icon: 'castle',
    desc: '38 种建筑的属性、可生产单位与科技',
    match: /^\/buildings?(\/.*)?$/,
  },
  { key: 'techs', path: '/techs', label: '科技', en: 'Technologies', icon: 'flask-conical', desc: '199 项科技的效果、费用与前置', match: /^\/techs?(\/.*)?$/ },
  { key: 'tree', path: '/tree', label: '科技树', en: 'Tech Tree', icon: 'git-branch', desc: '每个文明的完整科技树与差异对照', match: /^\/tree(\/.*)?$/ },
  {
    key: 'bonuses',
    path: '/bonuses',
    label: '文明加成',
    en: 'Civ Bonuses',
    icon: 'scroll',
    desc: '全部文明与团队加成：效果、作用对象与数值示例',
    match: /^\/bonuses$/,
    hideNav: true,
  },
  { key: 'dlc', path: '/dlc', label: 'DLC', en: 'Expansions', icon: 'package', desc: '14 个资料片与对应文明', match: /^\/dlc$/, hideNav: true },
  {
    key: 'patches',
    path: '/patches',
    label: '版本补丁',
    en: 'Patch Notes',
    icon: 'scroll',
    desc: '每次补丁对文明/单位的改动',
    match: /^\/patches(\/.*)?$/,
    hideNav: true,
  },
];
export const TOOLS: Section[] = [
  {
    key: 'builds',
    path: '/builds',
    label: '开局流程',
    en: 'Build Orders',
    icon: 'list-ordered',
    desc: '主流开局分步骤时间线：几分几秒到封建、卡在哪一步',
    match: /^\/builds$/,
  },
  { key: 'compare', path: '/compare', label: '文明对比', en: 'Compare', icon: 'scale', desc: '两个文明的能力雷达与关键差异', match: /^\/compare$/ },
  { key: 'matchup', path: '/matchup', label: '对局助手', en: 'Matchup', icon: 'crosshair', desc: '根据双方文明给出反制建议', match: /^\/matchup$/ },
  {
    key: 'simulator',
    path: '/simulator',
    label: '科技模拟器',
    en: 'Simulator',
    icon: 'calculator',
    desc: '选择单位与科技，计算满科技属性与累计费用',
    match: /^\/simulator$/,
  },
  {
    key: 'duel',
    path: '/duel',
    label: '单位 PK',
    en: 'Unit Duel',
    icon: 'sword',
    desc: '两个单位（含科技与文明加成）对战：击杀次数、用时、群战与等资源',
    match: /^\/duel$/,
  },
  {
    key: 'production',
    path: '/production',
    label: '持续生产',
    en: 'Production',
    icon: 'calculator',
    desc: '按生产建筑和科技计算每分钟开销与村民分配',
    match: /^\/production$/,
  },
];
/** 已上线的子工具：提供全局搜索与面包屑，不增加首页工具卡片。 */
export const SECONDARY_TOOLS: Section[] = [
  {
    key: 'trade-income',
    path: '/trade-income',
    label: '商路供给',
    en: 'Trade Income',
    icon: 'calculator',
    desc: '按实测交金周期估算贸易收入、目标车船数与投资',
    match: /^\/trade-income$/,
    hideNav: true,
  },
  {
    key: 'construction',
    path: '/construction',
    label: '多人施工',
    en: 'Construction',
    icon: 'castle',
    desc: '比较施工人数、完工时间、村民工时与停采估算',
    match: /^\/construction$/,
    hideNav: true,
  },
  {
    key: 'team-bonuses',
    path: '/team-bonuses',
    label: '队伍加成',
    en: 'Team Bonuses',
    icon: 'users',
    desc: '一屏查看队伍加成来源与需要研究的团队科技',
    match: /^\/team-bonuses$/,
    hideNav: true,
  },
  {
    key: 'garrison-healing',
    path: '/garrison-healing',
    label: '驻军回血',
    en: 'Garrison Healing',
    icon: 'calculator',
    desc: '核对治疗资格、草药效果与单目标理论恢复时间',
    match: /^\/garrison-healing$/,
    hideNav: true,
  },
  {
    key: 'eco-payoff',
    path: '/eco-payoff',
    label: '经济科技收益',
    en: 'Economic Technology Payoff',
    icon: 'calculator',
    desc: '固定村民与距离，对比单项采集科技的研究投入和收益',
    match: /^\/eco-payoff$/,
    hideNav: true,
  },
  {
    key: 'market',
    path: '/market',
    label: '市场买卖',
    en: 'Market',
    icon: 'calculator',
    desc: '逐笔估算市场买卖、库存预算与两份方案的收支',
    match: /^\/market$/,
    hideNav: true,
  },
];
export const FUTURE: Section[] = [
  {
    key: 'ladder',
    path: '/ladder',
    label: '天梯数据',
    en: 'Ladder Stats',
    icon: 'trophy',
    desc: '团战排位胜率、出场率',
    match: /^\/ladder$/,
    status: 'planned',
  },
];

export const ALL = [...WIKI, ...TOOLS, ...SECONDARY_TOOLS, ...FUTURE];
export const sectionOf = (path: string) => ALL.find((s) => s.match.test(path));
