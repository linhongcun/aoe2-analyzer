import type { IconName } from '../ui/Icon';
import { PAGES, SECTION_GROUPS, type PageDef, type SectionGroup } from './pageRegistry';

export { SECTION_GROUPS };
export type { SectionGroup };

/** 导航、首页、面包屑和搜索里的页面结果。字段从 pageRegistry 派生，不在这里另维护一份名单。 */
export interface Section {
  key: string;
  group: SectionGroup;
  path: string;
  label: string;
  en: string;
  icon: IconName;
  desc: string;
  /** 当前路径是否属于该模块（用于高亮与面包屑） */
  match: RegExp;
  status?: 'planned';
  /** 不作为顶部独立快捷入口显示；分组工具菜单仍收录所有已上线页面 */
  hideNav?: boolean;
  /** 404「你是不是要找」的常见写法 / 旧路径（issue 315） */
  aliases?: readonly string[];
  /** 全局搜索俗称 */
  searchAliases?: readonly string[];
}

function toSection(page: PageDef): Section {
  return {
    key: page.key,
    group: page.group!,
    path: page.path,
    label: page.label!,
    en: page.en!,
    icon: page.icon!,
    desc: page.desc!,
    match: page.match!,
    status: page.status,
    hideNav: page.hideNav,
    aliases: page.aliases,
    searchAliases: page.searchAliases,
  };
}

export const WIKI: Section[] = PAGES.filter((page) => page.lane === 'wiki').map(toSection);
export const TOOLS: Section[] = PAGES.filter((page) => page.lane === 'tool').map(toSection);
/** 已上线的扩展工具，与首页、工具菜单共用用途分组。 */
export const SECONDARY_TOOLS: Section[] = PAGES.filter((page) => page.lane === 'secondary').map(toSection);
export const FUTURE: Section[] = PAGES.filter((page) => page.lane === 'future').map(toSection);

export const ALL = [...WIKI, ...TOOLS, ...SECONDARY_TOOLS, ...FUTURE];
/** 两处入口都从模块的 group 派生，新增已上线模块自动进入对应分组。 */
export const HOME_GROUPS = SECTION_GROUPS.map((group) => ({
  ...group,
  sections: ALL.filter((section) => section.status !== 'planned' && section.group === group.key),
}));
export const TOOL_GROUPS = HOME_GROUPS;

export const sectionOf = (path: string) => ALL.find((s) => s.match.test(path));
