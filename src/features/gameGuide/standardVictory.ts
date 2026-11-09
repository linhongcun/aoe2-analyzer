/**
 * Standard 胜利页面入口：数值模型已下沉 `src/domain/standardVictory.ts`，本文件保留来源卡片与中文操作词。
 */
export * from '../../domain/standardVictory';

export const BASE_COUNTDOWN = '随地图尺寸变化';

export const OFFICIAL_185872 = {
  title: '官方：Update 185872',
  url: 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-185872/',
  publishedAt: '2026-09-22',
  build: '185872',
  timer: 'Atheism now applies Wonder and Relic victory timer increase only to enemy and neutral players.',
  stack: 'Atheism victory timer increase can now stack if the technology was researched more than once in the game.',
  income: 'Atheism now applies the Relic income reduction effect also to the players neutral to the Hun player.',
} as const;

export const RANKED_ENDING = {
  title: '官方教学：Ending a Match',
  url: 'https://www.ageofempires.com/learn-to-play/ending-a-match-aoe2/',
  checkedAt: '2026-11-07',
  quote: 'a match on the ranked ladder officially ends when all your opponent\u2019s Villagers, Military Units and Production Buildings have been destroyed',
} as const;

/** Last-Modified 是响应头日期；checkedAt 是本站阅读日。数值不从这一页抄进倒计时。 */
export const UGC_VICTORY_TIME = {
  title: 'UGC Resources',
  url: 'https://ugc.aoe2.rocks/general/resources/resources/',
  lastModified: '2026-11-05',
  checkedAt: '2026-11-07',
} as const;

export function opLabel(op: string | null): string | null {
  if (op === 'set') return '设为';
  if (op === 'add') return '增加';
  if (op === 'mul') return '乘以';
  return null;
}
