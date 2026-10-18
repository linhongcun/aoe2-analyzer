import type { Unit } from './types';

/** 推荐路线里的旧称，仅用于展示规范化，不扩充搜索别名。 */
const openingNames: Record<string, number> = {
  芒古代: 11,
  藤牌弓手: 1129,
  'Shrivamsha 骑手': 1751,
  侦察骑兵: 448,
  侦察: 448,
  鹰侦察兵: 751,
  鹰侦察: 751,
  弓箭手: 4,
  弓箭: 4,
  弓手: 4,
  弩兵: 24,
  长弓手: 8,
  骑射: 39,
  长矛: 93,
  冲车: 1258,
  投石车: 280,
  羽冠弓手: 763,
  复合弓: 1800,
  大象弓手: 873,
  重骑射: 474,
  胡斯卡尔: 41,
  美洲豹: 725,
  侠客: 281,
  圣骑士: 569,
  蝎子: 279,
};

export function openingText(text: string, units: readonly Pick<Unit, 'id' | 'en' | 'zh'>[]): string {
  const names = new Map<string, string>();
  for (const u of units) {
    names.set(u.en, u.zh);
    names.set(u.zh, u.zh); // 最长匹配，保留已有官方全名中的「弓手」等子串。
  }
  for (const [name, id] of Object.entries(openingNames)) {
    const u = units.find((u) => u.id === id);
    if (u) names.set(name, u.zh);
  }
  const tokens = [...names.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  let result = '';
  for (let i = 0; i < text.length;) {
    const token = tokens.find((t) => text.startsWith(t, i));
    result += token ? names.get(token)! : text[i];
    i += token?.length ?? 1;
  }
  return result;
}

/** 只匹配开局阶段；后续城堡兵种不能被误当成封建开局。 */
export function openingBuildIds(text: string): string[] {
  const first = text.split('->')[0] ?? '';
  const ids: string[] = [];
  if (/速城堡|速升城堡|直城/.test(first)) return ['fast-castle-boom'];
  if (/民兵/.test(first)) ids.push('maa-archers-18');
  if (/弓手|弓箭/.test(first)) ids.push('archers-19');
  if (/侦察|斥候/.test(first) && !/鹰侦察/.test(first)) ids.push('scouts-18');
  return ids;
}
