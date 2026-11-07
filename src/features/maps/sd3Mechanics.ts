import { SD3_SOURCE } from './suddenDessaster3Data';

export { SD3_SOURCE };

/** Public handbook read on this date. The page has no Updated line. */
export const SD3_MECHANICS_CHECKED_AT = '2026-11-07';

export const SD3_MECHANICS_LINK = 'Sudden Dessaster 3 手册';

export const SD3_MECHANICS_LEAD = '下面三张短卡转写 Sudden Dessaster 3 手册中的图机制。';

export const SD3_MECHANICS_SOURCE_NOTE = '手册页面未标更新日期。英文名沿用手册，中文名沿用本站赛事图合集的检索译名。这里只转写该页说明，不引用本站单位数据。';

const NUMBER_TOKENS = ['1,800', '65 秒'] as const;

export function mechanicPieces(text: string): { kind: 'text' | 'num'; value: string }[] {
  const pattern = new RegExp(`(${NUMBER_TOKENS.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text
    .split(pattern)
    .filter((value) => value.length > 0)
    .map((value) => ({ kind: (NUMBER_TOKENS as readonly string[]).includes(value) ? 'num' : 'text', value }));
}

/** First batch only. Later handbook maps stay out of this card. */
export const SD3_MECHANICS = [
  {
    id: 'thin-ice',
    en: 'Thin Ice',
    name: '薄冰',
    author: 'TheMadCADer',
    facts: ['你的船坞被毁后，整片冰以及冰上的一切会落入下方的危险水域。', 'large warships 不能在结冰水域航行。', '船坞只能训练经济单位和爆破船。'],
    pending: [
      '待确认：large warships 具体是哪些船，手册未点名。',
      '待确认：经济单位具体有哪些，手册未逐条列出。',
      '待确认：手册原文是 Demolition Ships，未逐一列出船种。',
      '待确认：落入危险水域之后会不会受伤或被移除，手册未写。',
    ],
  },
  {
    id: 'monkey-island',
    en: 'Monkey Island',
    name: '猴岛',
    author: 'Jasouki',
    facts: [
      '岩石边界限制可活动区域，周围水域不可进入。',
      '使用生命值 1,800 的石墙。',
      '图内散布多座军帐（Army Tents）。占领军帐后可以训练爆破兵。',
      '每座军帐都是爆破兵冲破城墙的另一个出生点。',
      '爆破兵从黑暗时代起可以训练，训练时间为 65 秒。',
    ],
    pending: ['待确认：占领军帐的操作方式，手册未写。', '待确认：爆破兵在哪座建筑训练，手册未写。'],
  },
  {
    id: 'holy-hollow',
    en: 'Holy Hollow',
    name: '圣谷',
    author: 'DeathCounter',
    facts: ['林中散布火药桶（Gunpowder Kegs）。摧毁一只火药桶会引发连锁反应，炸开通往中部的通道，并在森林中清出缺口。'],
    pending: ['待确认：火药桶的生命值、爆炸范围，以及需要何种攻击才能引爆，手册未写。'],
  },
] as const;
