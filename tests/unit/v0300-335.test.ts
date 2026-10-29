// v0.30.0 #335 验收：全站来源日期统一按北京时间（UTC+8）。Kent Beck 2026-10-22。
// 口径（#335）：所有日期取来源公开时间戳，再换算成北京时间的日期；补丁 185872 用官方补丁说明文章的发布时间；
// 不在范围：产品 releaseDate（没有来源链接）、build-order 的 accessed/date（访问/核对日期）、核对日（checkedAt/verifiedAt 等）。
//
// 下表是每个来源的公开时间戳，2026-10-22 08:30–08:50 北京时间由 Kent 逐条从公开页面读取（读取方式写在每条后面）：
//   ageofempires.com / aoe2.guide / IGN / note.com：页面 <meta property="article:published_time"> 或 JSON-LD datePublished
//   forums.ageofempires.com：Discourse 公开 JSON（/t/<id>.json 的 created_at；引用某条回复时取该回复）
//   Steam 讨论：页面首帖 data-timestamp；Steam 创意工坊：详情页「Posted / Updated」（以 timezoneOffset=0 读 UTC）
//   support.ageofempires.com：Zendesk 公开 API /api/v2/help_center/en-us/articles/<id>.json 的 created_at
//   reddit：arctic-shift 公开存档 API 的 created_utc（reddit 本站拒绝匿名抓取）
// 以后新加带来源链接的发布/更新日期，必须先把来源时间戳加进下表，否则「清单完整」一条会失败（#335「以后新加条目也照这条检查」）。
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

// #486：仅把「当时当前版本」的输入封存；旧日期、数字、内容叶子快照仍按原验收锁定。
const HISTORICAL_INPUT_RAW = readFileSync('scripts/patch_inputs/185872.json', 'utf8');
const HISTORICAL_INPUT = JSON.parse(HISTORICAL_INPUT_RAW) as {
  patch: { build: number; date: string; detectedFrom: string };
  sources: Record<string, { repo: string; commit: string; date: string }>;
  generatedVersions: Record<string, string[]>;
};

type Stamp = { ts: string; how: string };
/** key：`${url} ${字段}`；字段为 published（publishedAt / published / date）或 updated（updatedAt） */
const STAMPS: Record<string, Stamp> = {
  // #488：只追加已核对的人物资料来源公开时间戳；年度战绩不是来源发布日期。
  'https://www.ageofempires.com/news/a-new-empire-rises-welcome-team-vitality-to-age-of-empires-ii-de/ published': {
    ts: '2026-01-26T12:00:27-08:00',
    how: '2026-10-29 已读取官方刊登的 Vitality 客座介绍公开时间戳；北京时间 2026-01-27',
  },
  'https://www.redbull.com/us-en/red-bull-wololo-londinium-recap-age-of-empires published': {
    ts: '2026-04-07T10:29:54Z',
    how: '2026-10-29 已读取主办方 Londinium 回顾公开时间戳；北京时间 2026-04-07',
  },
  'https://www.redbull.com/pl-pl/podsumowanie-red-bull-wololo-iv-age-of-empires published': {
    ts: '2021-06-28T17:03:58Z',
    how: '2026-10-29 已读取主办方 Wololo IV 回顾公开时间戳；北京时间 2021-06-29',
  },
  'https://www.redbull.com/at-de/red-bull-wololo-iv-finale-recap published': {
    ts: '2021-07-13T14:12:05Z',
    how: '2026-10-29 已读取主办方 Wololo IV 决赛回顾公开时间戳；北京时间 2021-07-13',
  },
  'https://www.redbull.com/int-en/red-bull-wololo-v-recap published': {
    ts: '2021-09-21T07:00:06Z',
    how: '2026-10-29 已读取主办方 Wololo V 回顾公开时间戳；北京时间 2021-09-21',
  },
  'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-188329/ published': {
    ts: '2026-10-27T10:04:41-07:00',
    how: '2026-10-29 实际读取官方页面 published_time；北京时间 2026-10-28，发行日另存 releaseDate',
  },
  // #435 新来源仅登记实际读取的公开时间戳；发行日独立保存在 releaseDate，不充当来源公开日期。
  'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-66692/ published': {
    ts: '2022-08-29T16:10:00-07:00',
    how: '2026-10-25 核对官方页面 article:published_time；北京时间 2022-08-30',
  },
  'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-81058/ published': {
    ts: '2023-04-11T15:20:00-07:00',
    how: '2026-10-25 核对官方页面 article:published_time；北京时间 2023-04-12',
  },
  'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-preview-125283/ published': {
    ts: '2024-10-14T12:13:32-07:00',
    how: '2026-10-25 核对官方页面 article:published_time；北京时间 2024-10-15，发行日另存独立事实字段',
  },
  'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-185872/ published': {
    ts: '2026-09-22T10:16:33-07:00',
    how: 'article:published_time',
  },
  'https://www.ageofempires.com/news/celebrate-5-years-of-age-ii-de-with-a-fresh-deal-for-new-players/ published': {
    ts: '2024-11-14T08:49:35-08:00',
    how: 'article:published_time',
  },
  'https://www.ageofempires.com/news/more-campaigns-now-available-in-return-of-rome/ published': {
    ts: '2023-12-20T10:00:00-08:00',
    how: 'article:published_time',
  },
  'https://www.ageofempires.com/news/what-to-expect-from-chronicles-alexander-the-great/ published': {
    ts: '2025-10-10T10:01:34-07:00',
    how: 'article:published_time',
  },
  'https://www.ageofempires.com/news/2pools2-2021/ published': { ts: '2021-03-30T15:58:35-07:00', how: 'article:published_time' },
  'https://steamcommunity.com/sharedfiles/filedetails/?id=2375610295 published': {
    ts: '2021-01-27T16:46:00Z',
    how: 'Steam 创意工坊 Posted（UTC 显示 Jan 27, 2021 @ 4:46pm）',
  },
  'https://steamcommunity.com/sharedfiles/filedetails/?id=2375610295 updated': {
    ts: '2024-05-12T08:00:00Z',
    how: 'Steam 创意工坊 Updated（UTC 显示 May 12, 2024 @ 8:00am）',
  },
  'https://forums.ageofempires.com/t/help-with-tamerlane-campaign-scenario-4/126217 published': {
    ts: '2021-04-18T19:27:35.265Z',
    how: 'Discourse t/126217 第 4 帖（FU 释义回复）created_at；主题首帖 2021-04-18T19:05:23Z，同为北京时间 04-19',
  },
  'https://steamcommunity.com/app/813780/discussions/0/819211732999210064/ published': {
    ts: '2025-08-17T17:16:03Z',
    how: 'Steam 讨论首帖 data-timestamp 1755450963',
  },
  // 以下来源现存日期已是北京时间，作为不该变的对照
  'https://www.ign.com/articles/2000/08/25/age-of-empires-ii-the-conquerors-the-battles-of-the-conquerors published': {
    ts: '2000-08-25T07:00:00.000Z',
    how: 'article:published_time',
  },
  'https://aoe2.guide/arena/ published': { ts: '2024-09-30T03:54:00+00:00', how: 'article:published_time' },
  'https://aoe2.guide/why-i-typically-disagree-with-the-forward-castle/ published': { ts: '2020-05-26T05:37:34+00:00', how: 'article:published_time' },
  'https://aoe2.guide/top-9-tips-aoe2-beginners-need-to-know/ published': {
    ts: '2020-05-25T18:22:27+00:00',
    how: 'article:published_time（UTC 05-25，北京时间 05-26）',
  },
  'https://aoe2.guide/teamgame-roles/ published': { ts: '2020-06-10T19:07:07+00:00', how: 'article:published_time（UTC 06-10，北京时间 06-11）' },
  'https://support.ageofempires.com/hc/en-us/articles/15552096234644-Return-of-Rome-DLC published': {
    ts: '2023-05-10T20:33:21Z',
    how: 'Zendesk created_at（UTC 05-10，北京时间 05-11）',
  },
  'https://support.ageofempires.com/hc/en-us/articles/31839163606932-Chronicles-Expansions-FAQ published': {
    ts: '2024-11-04T18:47:03Z',
    how: 'Zendesk created_at（UTC 11-04，北京时间 11-05）',
  },
  'https://www.reddit.com/r/aoe2/comments/1jcdkzv/how_does_work_faster_actually_work/ published': {
    ts: '2025-03-16T04:24:55Z',
    how: 'arctic-shift created_utc',
  },
  'https://steamcommunity.com/app/813780/discussions/0/5154941593375185108/ published': { ts: '2022-04-18T09:20:45Z', how: 'Steam 讨论首帖 data-timestamp' },
  'https://steamcommunity.com/app/813780/discussions/0/4415298919343522251/ published': { ts: '2024-07-06T08:55:12Z', how: 'Steam 讨论首帖 data-timestamp' },
  'https://note.com/fb_shokai/n/n057f2d5aab82 published': { ts: '2023-02-22T19:11:53.000+09:00', how: 'JSON-LD datePublished' },
  'https://note.com/aoe2_moti/n/ne0367d003ef2 published': { ts: '2026-08-15T20:56:22.000+09:00', how: 'JSON-LD datePublished' },
  'https://forums.ageofempires.com/t/a-reminder-how-broken-turks-are-on-arena-and-need-nerfs-here/222904 published': {
    ts: '2023-01-20T03:51:32.583Z',
    how: 'Discourse created_at',
  },
  'https://forums.ageofempires.com/t/how-to-get-better-at-team-games/112860 published': { ts: '2021-01-03T09:36:54.356Z', how: 'Discourse created_at' },
};

/** 来源时间戳换算成北京时间（UTC+8）的日期 */
function beijingDate(ts: string): string {
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) throw new Error(`无效时间戳 ${ts}`);
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 只认语言参数以外的 URL 本体：去掉 ?l= / ?hl= 这类界面语言参数（#271 会去掉 ?l=hungarian），保留 ?id= 等定位参数 */
function normUrl(u: string): string {
  const url = new URL(u);
  for (const p of ['l', 'hl']) url.searchParams.delete(p);
  return url.toString();
}

const PUBLISHED = new Set(['publishedAt', 'published', 'date']);
const UPDATED = new Set(['updatedAt']);
type Entry = { file: string; path: string; field: 'published' | 'updated'; date: string; url: string };
function collect(): Entry[] {
  const files = [
    ...readdirSync('src/content')
      .filter((f) => f.endsWith('.json'))
      .map((f) => `src/content/${f}`),
    ...readdirSync('src/data/patches')
      .filter((f) => f.endsWith('.json'))
      .map((f) => `src/data/patches/${f}`),
  ];
  const out: Entry[] = [];
  const walk = (o: unknown, path: string, file: string) => {
    if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${path}[${i}]`, file));
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    const url = [rec.url, rec.href, rec.source].find((v): v is string => typeof v === 'string' && /^https?:\/\//.test(v));
    for (const [k, v] of Object.entries(rec)) {
      if (url && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && (PUBLISHED.has(k) || UPDATED.has(k)))
        out.push({ file, path: `${path}.${k}`, field: UPDATED.has(k) ? 'updated' : 'published', date: v, url });
      walk(v, `${path}.${k}`, file);
    }
  };
  for (const f of files) walk(JSON.parse(readFileSync(f, 'utf8')), '', f);
  return out;
}
const ENTRIES = collect();
const keyOf = (e: Entry) => `${normUrl(e.url)} ${e.field}`;
const NORM_STAMPS = new Map<string, (typeof STAMPS)[keyof typeof STAMPS]>(
  Object.entries(STAMPS).map(([k, v]) => {
    const i = k.lastIndexOf(' ');
    return [`${normUrl(k.slice(0, i))} ${k.slice(i + 1)}`, v];
  }),
);

describe('#335 来源日期 = 来源公开时间戳换算成北京时间的日期', () => {
  it('防空转：扫到的带来源链接的发布/更新日期不少于 29 处（f856c9e 上为 29 处）', () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(29);
  });
  it('清单完整：每个带来源链接的发布/更新日期都在本表登记了来源时间戳（新加条目先登记再提交）', () => {
    expect(ENTRIES.filter((e) => !NORM_STAMPS.has(keyOf(e))).map((e) => `${e.file}${e.path} ${e.date} ${e.url}`)).toEqual([]);
  });

  // #335 表格里要改的条目（f856c9e 上应为红）
  const MUST_CHANGE: [string, string, string][] = [
    ['src/content/contentCatalog.json', '.products[1].sources[2].publishedAt', '2024-11-15'],
    ['src/content/contentCatalog.json', '.products[2].sources[2].publishedAt', '2024-11-15'],
    ['src/content/contentCatalog.json', '.products[3].sources[2].publishedAt', '2024-11-15'],
    ['src/content/contentCatalog.json', '.products[4].sources[2].publishedAt', '2023-12-21'],
    ['src/content/contentCatalog.json', '.products[7].sources[3].publishedAt', '2025-10-11'],
    ['src/content/contentCatalog.json', '.products[8].sources[3].publishedAt', '2025-10-11'],
    ['src/content/game-guide.json', '.sources.official-185872.publishedAt', '2026-09-23'],
    ['src/content/mixed-army.json', '.sources[5].publishedAt', '2026-09-23'],
    ['src/data/patches/185872.json', '.date', '2026-09-23'],
    ['src/content/team-plan.json', '.sources[0].published', '2021-03-31'],
    ['src/content/campaigns.json', '.sources.guide-civs-2024.publishedAt', '2021-01-28'],
    ['src/content/glossary.json', '[5].sources[0].date', '2021-04-19'],
    ['src/content/glossary.json', '[8].sources[0].date', '2025-08-18'],
  ];
  for (const [file, path, want] of MUST_CHANGE)
    it(`要改：${file}${path} 是北京时间 ${want}`, () => {
      const e = ENTRIES.find((x) => x.file === file && x.path === path);
      expect(e, '条目还在原位置').toBeDefined();
      expect(e!.date).toBe(want);
      expect(beijingDate(NORM_STAMPS.get(keyOf(e!))!.ts)).toBe(want);
    });

  it('全部条目：存的日期 = 来源时间戳的北京时间日期（含现已正确的对照条目）', () => {
    const bad = ENTRIES.filter((e) => NORM_STAMPS.has(keyOf(e)))
      .filter((e) => e.date !== beijingDate(NORM_STAMPS.get(keyOf(e))!.ts))
      .map((e) => `${e.file}${e.path}：存 ${e.date}，北京时间 ${beijingDate(NORM_STAMPS.get(keyOf(e))!.ts)}`);
    expect(bad).toEqual([]);
  });

  // 对照：本来就对的条目，日期不能被顺手改动（f856c9e 上为绿）
  const KEEP: [string, string, string][] = [
    ['src/content/campaigns.json', '.sources.guide-civs-2024.updatedAt', '2024-05-12'],
    ['src/content/campaigns.json', '.sources.ign-conquerors-2000.publishedAt', '2000-08-25'],
    ['src/content/castle-defense.json', '.sources[2].date', '2024-09-30'],
    ['src/content/castle-defense.json', '.sources[3].date', '2020-05-26'],
    ['src/content/contentCatalog.json', '.products[4].sources[3].publishedAt', '2023-05-11'],
    ['src/content/contentCatalog.json', '.products[7].sources[2].publishedAt', '2024-11-05'],
    ['src/content/contentCatalog.json', '.products[8].sources[2].publishedAt', '2024-11-05'],
    ['src/content/glossary.json', '[7].sources[0].date', '2025-03-16'],
    ['src/content/mixed-army.json', '.sources[0].publishedAt', '2022-04-18'],
    ['src/content/mixed-army.json', '.sources[1].publishedAt', '2024-07-06'],
    ['src/content/mixed-army.json', '.sources[2].publishedAt', '2023-02-22'],
    ['src/content/mixed-army.json', '.sources[3].publishedAt', '2024-09-30'],
    ['src/content/mixed-army.json', '.sources[4].publishedAt', '2023-01-20'],
    ['src/content/scouting.json', '.sources[1].publishedAt', '2020-05-26'],
    ['src/content/scouting.json', '.sources[2].publishedAt', '2026-08-15'],
    ['src/content/team-plan.json', '.sources[1].published', '2020-06-11'],
    ['src/content/team-plan.json', '.sources[2].published', '2021-01-03'],
  ];
  it('对照：已经是北京时间的 17 处日期不变', () => {
    expect(KEEP.map(([f, p]) => ENTRIES.find((x) => x.file === f && x.path === p)?.date)).toEqual(KEEP.map(([, , d]) => d));
  });

  it('补丁 185872：补丁数据文件与引用官方补丁说明的地方用同一个日期', () => {
    const OFFICIAL = 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-185872/';
    const dates = ENTRIES.filter((e) => normUrl(e.url) === normUrl(OFFICIAL)).map((e) => `${e.file}${e.path}=${e.date}`);
    expect(dates.length, '补丁文件 + game-guide + mixed-army').toBeGreaterThanOrEqual(3);
    expect(new Set(dates.map((d) => d.split('=')[1])).size).toBe(1);
  });

  // Steve 2026-10-22 确认：站内日期一律北京时间；185872 于 2026-09-23 01:17（北京时间）发布，数据版本日期也是 2026-09-23。
  it('补丁 185872 的历史输入指纹仍与 #486 封存时相同', () => {
    expect(createHash('sha256').update(HISTORICAL_INPUT_RAW).digest('hex')).toBe('94b5ae8e67dbb19382162a9a5d2f7d935ef82f7858b92af681d4397505cb2a42');
  });
  it('补丁 185872 的数据版本日期：历史 data_sources 的 patch.date 为 2026-09-23', () => {
    const ds = HISTORICAL_INPUT;
    expect(ds.patch.build).toBe(185872);
    expect(ds.patch.date).toBe('2026-09-23');
  });
  it('补丁 185872 的数据版本日期：历史生成数据里的「DE Update 185872 (日期)」都写 2026-09-23', () => {
    const hits: string[] = [];
    for (const [f, versions] of Object.entries(HISTORICAL_INPUT.generatedVersions))
      for (const m of versions.join('\n').matchAll(/185872 \((\d{4}-\d{2}-\d{2})\)/g)) hits.push(`${f}=${m[1]}`);
    expect(hits.length, '防空转').toBeGreaterThanOrEqual(5);
    expect(hits.filter((h) => !h.endsWith('=2026-09-23'))).toEqual([]);
  });

  it('换算函数自检：UTC 16:00 起算北京时间次日', () => {
    expect(beijingDate('2024-11-14T15:59:59Z')).toBe('2024-11-14');
    expect(beijingDate('2024-11-14T16:00:00Z')).toBe('2024-11-15');
    expect(beijingDate('2024-11-14T08:49:35-08:00')).toBe('2024-11-15');
  });
});

// 不在范围的日期不动：产品 releaseDate、build-order 的 accessed / review.date（f856c9e 原值）
describe('#335 对照：不在范围的日期不变', () => {
  const cat = JSON.parse(readFileSync('src/content/contentCatalog.json', 'utf8')) as { products: { id: string; releaseDate?: string }[] };
  it('contentCatalog 各产品 releaseDate 与 f856c9e 相同', () => {
    expect(Object.fromEntries(cat.products.map((p) => [p.id, p.releaseDate ?? null]))).toMatchSnapshot();
  });
  it('开局库 review.date / accessed 与 f856c9e 相同', () => {
    const dir = 'src/data/build-orders';
    const got: Record<string, unknown> = {};
    for (const f of readdirSync(dir)
      .filter((x) => x.endsWith('.json'))
      .sort()) {
      const j = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Record<string, unknown>;
      const dates: string[] = [];
      JSON.stringify(j, (k, v) => {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) dates.push(`${k}=${v}`);
        return v;
      });
      got[f] = dates;
    }
    expect(got).toMatchSnapshot();
  });
});

// 「数值和其他文字都不动」：改到的 7 个文件里，除 MUST_CHANGE 的日期外，全部叶子值（数字与文字）与 f856c9e 相同。
// mixed-army.json 同版还会被 #271 改单位名和 Steam 链接，所以该文件只守数字和带数字的文字（如补丁 before/after、日期），不守纯文字；#271 合入后若 URL 里数字变化，按 #271 的验收重录本快照。
const MASKED = new Set(MUST_CHANGE_KEYS());
function MUST_CHANGE_KEYS(): string[] {
  return [
    'src/content/contentCatalog.json.products[1].sources[2].publishedAt',
    'src/content/contentCatalog.json.products[2].sources[2].publishedAt',
    'src/content/contentCatalog.json.products[3].sources[2].publishedAt',
    'src/content/contentCatalog.json.products[4].sources[2].publishedAt',
    'src/content/contentCatalog.json.products[7].sources[3].publishedAt',
    'src/content/contentCatalog.json.products[8].sources[3].publishedAt',
    'src/content/game-guide.json.sources.official-185872.publishedAt',
    'src/content/mixed-army.json.sources[5].publishedAt',
    'src/data/patches/185872.json.date',
    'src/content/team-plan.json.sources[0].published',
    'src/content/campaigns.json.sources.guide-civs-2024.publishedAt',
    'src/content/glossary.json[5].sources[0].date',
    'src/content/glossary.json[8].sources[0].date',
  ];
}
// #270 给内容指南的战役/剧本补了中文名（zh），叶子快照因此多出这些名字；日期仍按上面的表锁定。
describe('#335 对照：改到的文件里除这 13 处日期外，数值和文字都不变', () => {
  for (const f of [
    'src/content/contentCatalog.json',
    'src/content/game-guide.json',
    'src/content/mixed-army.json',
    'src/data/patches/185872.json',
    'src/content/team-plan.json',
    'src/content/campaigns.json',
    'src/content/glossary.json',
  ])
    it(`${f}：除 #335 日期外的叶子值与 f856c9e 相同`, () => {
      const onlyDigits = f.endsWith('mixed-army.json');
      const leaves: string[] = [];
      const walk = (o: unknown, p: string) => {
        if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${p}[${i}]`));
        if (o && typeof o === 'object') return Object.entries(o).forEach(([k, v]) => walk(v, `${p}.${k}`));
        if (MASKED.has(`${f}${p}`)) return;
        if (onlyDigits && !(typeof o === 'number' || (typeof o === 'string' && /\d/.test(o) && !/^https?:/.test(o)))) return;
        leaves.push(`${p}=${JSON.stringify(o)}`);
      };
      walk(JSON.parse(readFileSync(f, 'utf8')), '');
      expect(MASKED.size).toBe(13);
      expect(leaves).toMatchSnapshot();
    });
});

// Steve 2026-10-22（PR #351 范围追加）：「关于数据」来源表的上游提交日期也按北京时间。
// 时间戳为 GitHub API /repos/<repo>/commits/<sha> 的 commit.committer.date（data:update 的 latest() 取的就是 committer.date），
// 2026-10-22 10:50 北京时间由 Kent 读取。
const PIN_STAMPS: Record<string, { commit: string; ts: string; want: string }> = {
  aoe2techtree: { commit: '3bb43b1439eef88dfe7fe892d7f7dc41ac9dd76f', ts: '2026-09-22T19:21:29Z', want: '2026-09-23' },
  halfon: { commit: 'abb48fdbedba57d5afe2b7941d6ae85cf6e0e803', ts: '2026-09-22T19:26:06Z', want: '2026-09-23' },
  // 对照：UTC 11:52，北京时间同日，不变
  dat: { commit: '0c38027504532826c9922e4db77e2c1d33554291', ts: '2026-10-07T11:52:25Z', want: '2026-10-07' },
};
describe('#335 历史 data_sources 的上游固定提交日期 = 提交时间的北京时间日期', () => {
  const ds = HISTORICAL_INPUT;
  it('只有这 3 个上游来源（新加来源须先在本表登记提交时间戳）', () => {
    expect(Object.keys(ds.sources).sort()).toEqual(Object.keys(PIN_STAMPS).sort());
  });
  for (const [k, p] of Object.entries(PIN_STAMPS))
    it(`sources.${k}：固定提交仍是 ${p.commit.slice(0, 7)}，date = ${p.want}（${p.ts} 的北京时间日期）`, () => {
      expect(ds.sources[k]!.commit).toBe(p.commit);
      expect(beijingDate(p.ts)).toBe(p.want);
      expect(ds.sources[k]!.date).toBe(p.want);
    });
  it('patch.date 与识别补丁号的 halfon 提交同一天（北京时间）', () => {
    const all = HISTORICAL_INPUT;
    expect(all.patch.detectedFrom).toContain('halfon@abb48fd');
    expect(all.patch.date).toBe(ds.sources.halfon!.date);
  });
});

// Steve 2026-10-22 追加 (b)：docs/PATCH-NOTES/185872.md（关于数据页链接的补丁差异摘要）末尾「上游：」行的提交日期也按北京时间。
describe('#335 docs/PATCH-NOTES/185872.md「上游：」行的提交日期 = 北京时间日期', () => {
  const lines = readFileSync('docs/PATCH-NOTES/185872.md', 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('上游：'));
  it('恰好一行「上游：」', () => {
    expect(lines.length).toBe(1);
  });
  const upstream: [string, string][] = [
    ['SiegeEngineers/aoe2techtree@3bb43b1', '2026-09-23'],
    ['SiegeEngineers/halfon@abb48fd', '2026-09-23'],
    ['SiegeEngineers/auto-mods@0c38027', '2026-10-07'], // 对照
  ];
  for (const [ref, want] of upstream)
    it(`${ref}（${want}）`, () => {
      expect(lines[0]).toContain(`${ref}（${want}）`);
    });
  it('「上游：」行不再有 2026-09-22，且与历史 data_sources 的固定日期一致', () => {
    expect(lines[0]).not.toContain('2026-09-22');
    const ds = HISTORICAL_INPUT;
    for (const s of Object.values(ds.sources)) expect(lines[0]).toContain(`${s.repo}@${s.commit.slice(0, 7)}（${s.date}）`);
  });
});
