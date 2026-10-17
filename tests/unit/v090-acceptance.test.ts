import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error no types for scripts/*.mjs
import { findReleaseCommit } from '../../scripts/release.mjs';
import civs from '../../src/data/civs.json';
import units from '../../src/data/units.json';
import techs from '../../src/data/techs.json';
import buildings from '../../src/data/buildings.json';
import { pyMatch, score, search, TIER, type SearchItem } from '../../src/domain/search';
import { gatherModel } from '../../src/domain/realCost';

/** v0.9.0 验收（#145）。Kent 写，先失败，功能做完后应全部通过。 */

describe('A #145 huns42flag 行数断言等字体加载', () => {
  it('A1 huns42flag.spec.ts 在量行数之前 await document.fonts.ready', () => {
    const src = readFileSync('tests/e2e/huns42flag.spec.ts', 'utf8');
    expect(src).toMatch(/document\.fonts\.ready/);
    // 必须在 lines() 里（或其调用前）等字体，不能只在别处出现
    const body = src.slice(src.indexOf('const lines'), src.indexOf('const lines') + 600);
    expect(body).toMatch(/fonts\.ready/);
  });
});

describe('B #145 发版脚本重跑认合入提交、本地残留 tag 提前报错', () => {
  const src = readFileSync('scripts/release.mjs', 'utf8');
  let repo: string;
  let relHead: string;
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (message: string) => {
    git('commit', '-q', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'release-commit-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Kent');
    git('config', 'user.email', 'kent@test');
    commit('base');
    git('checkout', '-q', '-b', 'release/v0.9.0');
    relHead = commit('release');
    git('checkout', '-q', 'main');
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it.each([false, true])('B1 重跑时以 release 合入 main 的提交为准（main 分叉：%s），不是当前 main 头部', (diverged) => {
    if (diverged) commit('main diverges');
    git('merge', '-q', '--no-ff', '-m', 'merge release', 'release/v0.9.0');
    const mergeCommit = git('rev-parse', 'HEAD');
    expect(mergeCommit).not.toBe(relHead);
    expect(findReleaseCommit(relHead, mergeCommit, repo)).toBe(mergeCommit);
    const later = commit('later on main');
    expect(findReleaseCommit(relHead, later, repo)).toBe(mergeCommit);
  });
  it('B2 本地残留 tag 在前置检查（合并之前）报错', () => {
    const early = src.indexOf('本地残留 tag');
    const mergeStep = src.indexOf('第 1 步：合并');
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(mergeStep);
  });
  it('B3 #162 C 手动 fast-forward 后 main 再有新提交，发版提交仍是 release 头', () => {
    git('merge', '-q', '--ff-only', 'release/v0.9.0');
    expect(git('rev-parse', 'HEAD')).toBe(relHead);
    expect(findReleaseCommit(relHead, relHead, repo)).toBe(relHead);
    const later = commit('later on main');
    expect(findReleaseCommit(relHead, later, repo)).toBe(relHead);
    const latest = commit('another commit on main');
    expect(findReleaseCommit(relHead, latest, repo)).toBe(relHead);
  });
  it('B4 release 尚未合入 main 时返回 null', () => {
    expect(findReleaseCommit(relHead, git('rev-parse', 'HEAD'), repo)).toBeNull();
    const later = commit('unrelated main commit');
    expect(findReleaseCommit(relHead, later, repo)).toBeNull();
  });
  it('B5 fast-forward 后的第一个 main 提交是 merge commit，仍返回 release 头', () => {
    git('merge', '-q', '--ff-only', 'release/v0.9.0');
    git('checkout', '-q', '-b', 'topic');
    commit('topic work');
    git('checkout', '-q', 'main');
    git('merge', '-q', '--no-ff', '-m', 'merge topic', 'topic');
    expect(findReleaseCommit(relHead, git('rev-parse', 'HEAD'), repo)).toBe(relHead);
    const later = commit('later on main');
    expect(findReleaseCommit(relHead, later, repo)).toBe(relHead);
  });
});

// ── E #145（调整拼音展示顺序）──
type Row = { zh: string; en: string; py?: string; pyi?: string; id?: number };
const KINDS = { civs: 'civ', units: 'unit', buildings: 'building', techs: 'tech' } as const;
const DATA = { civs, units, buildings, techs } as unknown as Record<keyof typeof KINDS, Row[]>;
const items: SearchItem[] = (Object.keys(KINDS) as (keyof typeof KINDS)[]).flatMap((f) =>
  DATA[f].map((r) => ({ ...r, kind: KINDS[f] }) as unknown as SearchItem),
);

describe('E #145 短拼音前缀不能被中英文命中挤出前 30', () => {
  it('E1 「ba」前 15 条里有百夫长', () => {
    expect(
      search(items, 'ba')
        .slice(0, 15)
        .map((r) => r.zh),
    ).toContain('百夫长');
  });
  it('E2 任一 2 字母查询，只要有拼音命中，前 30 条里至少出现 1 条拼音命中', () => {
    const bad: string[] = [];
    for (const a of 'abcdefghijklmnopqrstuvwxyz')
      for (const b of 'abcdefghijklmnopqrstuvwxyz') {
        const q = a + b;
        const pyHits = items.filter((it) => pyMatch(it, q));
        if (!pyHits.length) continue;
        const top = search(items, q);
        if (!top.some((it) => pyMatch(it, q))) bad.push(q);
        if (items.some((it) => score(it, q) > TIER.py)) expect(score(top[0]!, q), q).toBeGreaterThan(TIER.py);
      }
    expect(bad).toEqual([]);
  });
  it('E3 中英文名称前缀命中仍优先（「ba」弹道学在百夫长前），拼音不再垫底', () => {
    const textItems = items.filter((x) => score(x, 'ba') > TIER.py);
    const pyItems = items.filter((x) => score(x, 'ba') === TIER.py);
    const text = search(textItems, 'ba', items.length);
    const py = search(pyItems, 'ba', items.length);
    const r = search(items, 'ba');
    const head = text.slice(0, 25);
    expect(r).toEqual([...head.filter((x) => score(x, 'ba') >= TIER.prefix), ...py.slice(0, 5), ...head.filter((x) => score(x, 'ba') < TIER.prefix)]);
    const names = r.map((x) => x.zh);
    expect(names.indexOf('弹道学')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('弹道学')).toBeLessThan(names.indexOf('百夫长'));
  });
  it('E4 不足 30 条时也提前展示拼音，不丢失结果', () => {
    const subset = items.filter((x) => score(x, 'ba') > TIER.py).slice(0, 8);
    const centurion = items.find((x) => x.zh === '百夫长')!;
    const text = search(subset, 'ba');
    expect(search([...subset, centurion], 'ba')).toEqual([
      ...text.filter((x) => score(x, 'ba') >= TIER.prefix),
      centurion,
      ...text.filter((x) => score(x, 'ba') < TIER.prefix),
    ]);
  });
  it('E5 小 limit 不超限，中英文命中仍居首；纯拼音查询填满可用位置', () => {
    const text = items.filter((x) => score(x, 'ba') > TIER.py);
    const first = search(text, 'ba')[0];
    for (const limit of [1, 2, 3, 5, 10]) {
      const r = search(items, 'ba', limit);
      expect(r).toHaveLength(limit);
      expect(r[0]).toBe(first);
      expect(new Set(r).size).toBe(limit);
    }
    expect(search(items, 'ba', 0)).toEqual([]);
    const py = items.filter((x) => score(x, 'ba') === TIER.py);
    expect(search(py, 'ba', 10)).toHaveLength(10);
  });
});

// ── F #138（kent/v090-acceptance @ fae2fc8 原样）──
describe('F #138 已核实的文明采集加成计入「等采集时间」', () => {
  it('F1 罗马（城堡）：只计入「村民采集速度 +5%」（来源 aoe2techtree），不再单列农田 +4%', () => {
    const g = gatherModel(3, 'Romans');
    expect(g.applied.map((x) => x.label)).toEqual(['村民采集速度 +5%']);
    expect(g.unsupported).toEqual([]);
  });
  it('F2 罗马农田有效速度 = 通用 0.5300 × 1.05 = 0.5565/秒（去掉 eco.json 额外 ×1.038095）', () => {
    const base = gatherModel(3).rate.farm;
    expect(base).toBeCloseTo(0.53, 6);
    expect(gatherModel(3, 'Romans').rate.farm).toBeCloseTo(base * 1.05, 6);
    expect(gatherModel(3, 'Romans').rate.farm).toBeCloseTo(0.5565, 4);
  });
  it('F3 罗马金/木/石：比通用快，但不超过 +5%（含往返路程）', () => {
    const b = gatherModel(3).rate,
      r = gatherModel(3, 'Romans').rate;
    for (const t of ['gold', 'wood', 'stone'] as const) {
      expect(r[t], t).toBeGreaterThan(b[t]);
      expect(r[t], t).toBeLessThan(b[t] * 1.05 + 1e-9);
    }
  });
  it('F4 罗马在黑暗/封建/帝王各时代都计入', () => {
    for (const age of [1, 2, 4])
      expect(
        gatherModel(age, 'Romans').applied.map((x) => x.label),
        String(age),
      ).toEqual(['村民采集速度 +5%']);
  });
  it('F5 没有来源或本版不计的仍「未计入」且速度等于通用：马里、玛雅、波兰、葡萄牙、蜀、西西里、高棉、亚美尼亚、波希米亚', () => {
    for (const c of ['Malians', 'Mayans', 'Poles', 'Portuguese', 'Shu', 'Sicilians', 'Khmer', 'Armenians', 'Bohemians']) {
      const g = gatherModel(4, c);
      expect(g.applied, c).toEqual([]);
      expect(g.unsupported.length, c).toBeGreaterThan(0);
      expect(g.rate, c).toEqual(gatherModel(4).rate);
    }
  });
  it('F7 斯拉夫：农田采集 +15%（来源值 ×1.15，不用 eco.json 的 1.23），农田 0.5300 × 1.15 = 0.6095/秒', () => {
    const g = gatherModel(3, 'Slavs');
    expect(g.applied.map((x) => x.label)).toEqual(['农田采集 +15%']);
    expect(g.rate.farm).toBeCloseTo(0.6095, 4);
    expect(g.rate.gold).toBeCloseTo(gatherModel(3).rate.gold, 9);
  });
  it('F6 已计入的不回退：凯尔特伐木 +15%、朝鲜采石 +20%、突厥采金 +25%、柏柏尔移速 +10%', () => {
    expect(gatherModel(3, 'Celts').applied.map((x) => x.label)).toEqual(['伐木 +15%']);
    expect(gatherModel(3, 'Koreans').applied.map((x) => x.label)).toEqual(['采石 +20%']);
    expect(gatherModel(3, 'Turks').applied.map((x) => x.label)).toEqual(['采金 +25%']);
    expect(gatherModel(3, 'Berbers').applied.map((x) => x.label)).toEqual(['村民移速 +10%']);
  });
});
