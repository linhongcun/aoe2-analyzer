/**
 * v0.29.0 验收（#329）B 组的单测部分：#316 入口说明与新增城镇中心两种解读、#313 清空撤销、#315 404 建议。Kent 写，先失败。
 * 排版类（#275 / #326 / .num）和交互时序（#325）在 e2e：tests/e2e/v0290-B.spec.ts、v0290-325-search.spec.ts。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import scoutingContent from '../../src/content/scouting.json';
import { emptyMatchReview } from '../../src/domain/matchReview';
import { analyseScouting, defaultScoutingConfig, SCOUTING_AREA_ZH, withScenario, type ScoutingArea, type ScoutingConfig } from '../../src/domain/scouting';
import { suggestRoutes } from '../../src/domain/routeSuggestions';
import { matchReviewDraftReducer } from '../../src/features/matchReview/matchReviewDraftState';
import { ALL } from '../../src/shared/nav/sections';

// ---------- #316 ③ ----------
const OLD_DESC = '对照相容解释、反证和缺失信息，决定下一次补查什么';
const NEW_DESC = '对照具体信号，判断对手在做什么，安排下一步';
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

describe('#316 「侦察辨析」入口说明', () => {
  it('sections 里的说明换成新措辞', () => {
    expect(ALL.find((s) => s.path === '/scouting')!.desc).toBe(NEW_DESC);
  });
  it('src 下任何文件（含搜索索引、别名）都不再出现旧措辞', () => {
    const hits = files('src').filter((f) => readFileSync(f, 'utf8').includes(OLD_DESC));
    expect(hits).toEqual([]);
  });
});

// ---------- #316 新增城镇中心按位置给两种解读（Steve 2026-10-21 21:11） ----------
// 公开来源 AoE2 Coach 城镇中心页 https://aoecoach.com/en/resources/buildings/town-center/ ：
// - Castle Age Boom：“Upon reaching Castle Age, immediately build 2-3 additional Town Centers … rapidly grows your economy”
// - Forward Town Center：“building a Town Center on a contested gold or stone pile secures resources”；In pro play：“placing a TC near the opponent both pressures them”
// - How to counter it：“scout the TC timing, and if your opponent is booming, either boom harder yourself or punish them militarily”；
//   “Forward TCs can be denied by contesting the location with early military or by Trebuchet/siege”
// 位置用观察的「可见范围」area：enemy-front（敌方正面）= 对方自家附近 → 扩张经济；own-approach（接近自家的通路）= 前线 / 我方资源点附近 → 前置进攻。
// enemy-edge（敌方侧面或外围）归哪一种待 Steve 定，这里不断言。
const BOOM = /扩张|经济/;
const FORWARD = /前置|进攻|压制/;
const BOOM_NEXT = /同步|跟着|一起|更快|也(扩张|发展)|施压|惩罚|出兵|进攻|攻击/;
const FORWARD_NEXT = /争夺|驱逐|拆|投石|攻城|阻止|攻击|反击|防守|施压/;
const leaves = (x: unknown): string[] =>
  typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap(leaves) : x && typeof x === 'object' ? Object.values(x).flatMap(leaves) : [];
const NEAR = /(对方|敌方)[^，。；]{0,8}(基地|自家|主城|家里|附近)/;
const FWD_LOC = /前线|前沿|(?:我方|我的|我们|(?<![对敌]方)自家)[^，。；]{0,6}(?:资源|附近)/;
/** 每个字符串、以及每个对象（其全部文字拼起来）各算一个节点 */
const nodes = (x: unknown): string[] =>
  typeof x === 'string' ? [x] : x && typeof x === 'object' ? [leaves(x).join('；'), ...Object.values(x).flatMap(nodes)] : [];
const walled = scoutingContent.scenarios.find((s) => s.id === 'walled')!;
const extraTc = walled.signals.find((s) => s.id === 'extra-tc')!;
const tcSeenAt = (area: ScoutingArea): ScoutingConfig => {
  const c = withScenario(defaultScoutingConfig(), 'walled');
  return { ...c, observations: { ...c.observations, 'new-town-center': { state: 'seen', at: '', area, stale: false } } };
};
/** 只在 a 里出现、b 里没有的文字（去掉观察快照里的范围名称本身） */
const only = (a: string[], b: string[]) => {
  const strip = (t: string) => Object.values(SCOUTING_AREA_ZH).reduce((x, zh) => x.split(zh).join(''), t);
  const bs = new Set(b.map(strip));
  return a.map(strip).filter((t) => !bs.has(t));
};

describe('#316 「看见新增城镇中心」按位置给两种解读，各有下一步', () => {
  it('来源只有 AoE2 Coach 城镇中心页，不标「本站整理」', () => {
    expect(extraTc.sourceIds).toEqual(['aoecoach-town-center']);
    expect(extraTc.editorial).toBe(false);
    const src = scoutingContent.sources.find((s) => s.id === 'aoecoach-town-center')!;
    expect(src.url).toBe('https://aoecoach.com/en/resources/buildings/town-center/');
  });
  it('信号内容里有两种解读，各带自己的下一步：对方自家附近 = 扩张经济，前线 / 我方资源点附近 = 前置进攻', () => {
    // 不限定字段结构：在 extra-tc 的任一子节点（一句话或一个对象）里找「位置 + 解读 + 下一步」，且这个节点不同时写着另一种位置
    const near = nodes(extraTc).filter((t) => NEAR.test(t) && BOOM.test(t) && !FWD_LOC.test(t));
    const fwd = nodes(extraTc).filter((t) => FWD_LOC.test(t) && FORWARD.test(t) && !NEAR.test(t));
    expect(near.length, '对方自家附近：扩张经济').toBeGreaterThan(0);
    expect(fwd.length, '前线 / 我方资源点附近：前置进攻').toBeGreaterThan(0);
    expect(
      near.some((t) => BOOM_NEXT.test(t)),
      `扩张经济的下一步（同步扩张或用军队施压）：${JSON.stringify(near)}`,
    ).toBe(true);
    expect(
      fwd.some((t) => FORWARD_NEXT.test(t)),
      `前置进攻的下一步（争夺位置 / 出兵或攻城武器拆除）：${JSON.stringify(fwd)}`,
    ).toBe(true);
  });
  it('辨析结果随位置变化：enemy-front 给扩张经济的解读，own-approach 给前置进攻的解读', () => {
    const near = leaves(analyseScouting(tcSeenAt('enemy-front'))),
      fwd = leaves(analyseScouting(tcSeenAt('own-approach')));
    expect(analyseScouting(tcSeenAt('own-approach')).status).toBe('covered');
    const onlyFwd = only(fwd, near),
      onlyNear = only(near, fwd);
    expect(
      onlyFwd.some((x) => FORWARD.test(x)),
      `own-approach 独有的文字里要有前置进攻解读：${JSON.stringify(onlyFwd)}`,
    ).toBe(true);
    expect(
      onlyNear.some((x) => BOOM.test(x)),
      `enemy-front 独有的文字里要有扩张经济解读：${JSON.stringify(onlyNear)}`,
    ).toBe(true);
  });
});

// ---------- #313 ----------
const withTitle = (title: string) => {
  const d = emptyMatchReview();
  d.context.title = title;
  return d;
};
describe('#313 手填复盘：连续清空两次后撤销', () => {
  it('clear 后 clear 后 undo 恢复最后一次非空的内容「旧草稿」', () => {
    let s = matchReviewDraftReducer({ draft: withTitle('旧草稿'), beforeClear: null }, { type: 'clear' });
    s = matchReviewDraftReducer(s, { type: 'clear' });
    s = matchReviewDraftReducer(s, { type: 'undo' });
    expect(s.draft.context.title).toBe('旧草稿');
  });
  it('守卫（#307 已验收）：清空 后 直接撤销恢复原内容；清空 后 编辑后撤销快照作废、新内容保留', () => {
    const cleared = matchReviewDraftReducer({ draft: withTitle('旧草稿'), beforeClear: null }, { type: 'clear' });
    expect(matchReviewDraftReducer(cleared, { type: 'undo' }).draft.context.title).toBe('旧草稿');
    const edited = matchReviewDraftReducer(cleared, { type: 'edit', draft: withTitle('新内容') });
    expect(edited.beforeClear).toBeNull();
    expect(matchReviewDraftReducer(edited, { type: 'undo' }).draft.context.title).toBe('新内容');
  });
  it('守卫：清空 后 编辑 后 清空 后 撤销，恢复的是编辑后的「新内容」，不是更早的旧草稿', () => {
    let s = matchReviewDraftReducer({ draft: withTitle('旧草稿'), beforeClear: null }, { type: 'clear' });
    s = matchReviewDraftReducer(s, { type: 'edit', draft: withTitle('新内容') });
    s = matchReviewDraftReducer(s, { type: 'clear' });
    expect(matchReviewDraftReducer(s, { type: 'undo' }).draft.context.title).toBe('新内容');
  });
});

// ---------- #315 ----------
// 与 NotFound.tsx 一致：已登记入口 + 关于数据。别名若登记在 sections 的条目上，会随条目一起传入。
const destinations = [...ALL, { path: '/about-data', label: '关于数据' }];
const first = (path: string) => suggestRoutes(path, destinations)[0]?.path;
describe('#315 404 页「你是不是要找」容错', () => {
  it.each([
    ['/glossery', '/glossary'],
    ['/glosary', '/glossary'],
    ['/buildorder', '/builds'],
    ['/build-orders', '/builds'],
    ['/tradeincome', '/trade-income'],
  ])('%s 第 1 条建议是 %s', (input, want) => {
    expect(first(input)).toBe(want);
  });
  it('最多 3 条，且都是已登记入口', () => {
    for (const input of ['/glossery', '/buildorder', '/tradeincome', '/team']) {
      const got = suggestRoutes(input, destinations);
      expect(got.length).toBeLessThanOrEqual(3);
      got.forEach((r) => expect(destinations.map((d) => d.path)).toContain(r.path));
    }
  });
  it('守卫：#/hotkey 到 快捷键速查，#/civ 到 文明 排第 1', () => {
    expect(first('/hotkey')).toBe('/hotkeys');
    expect(first('/civ')).toBe('/civs');
  });
  it('反例：很短的乱写路径 #/ab、明显无关的 #/this-page-does-not-exist-xyz 不出建议', () => {
    expect(suggestRoutes('/ab', destinations)).toEqual([]);
    expect(suggestRoutes('/this-page-does-not-exist-xyz', destinations)).toEqual([]);
  });
});
