/**
 * 高地机制页面入口：数值模型已下沉 `src/domain/elevation.ts`，本文件保留来源卡片与待确认文案。
 */
export * from '../../domain/elevation';

/** UGC Resources。lastModified 用响应头 Last-Modified 的日期，不猜正文发布日。 */
export const UGC_ELEVATION_SOURCE = {
  title: 'UGC Resources',
  url: 'https://ugc.aoe2.rocks/general/resources/resources/',
  lastModified: '2026-11-05',
} as const;

/** 官方新闻页 JSON-LD 的 datePublished。正文只承认高地加成存在，不给乘子。 */
export const HOTFIX_82587 = {
  title: '官方 Hotfix 82587',
  url: 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-hotfix-82587/',
  publishedAt: '2023-04-27',
  build: '82587',
  quote: 'Organ Guns would largely ignore hill bonuses/penalties',
} as const;

export const CLIFF_PENDING = '悬崖是否与山体同一套乘子：待确认。站内经济数据没有悬崖专用字段，本页不补写。';
export const TERRAIN_OMISSION = '单位 PK 和对局助手的伤害计算未计入地形高低差。';
