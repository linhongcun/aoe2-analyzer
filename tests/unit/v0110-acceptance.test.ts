import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import civs from '../../src/data/civs.json';
import { gatherModel } from '../../src/domain/realCost';
import { uncountedText } from '../../src/features/duel/components/RealCost';
import { search, score, TIER, type SearchItem } from '../../src/domain/search';

/** v0.11.0 验收（#162）。Kent 写，先失败，功能做完后应全部通过。 */

// useSearchIndex 是 hook：这里让 useMemo 直接执行、useCore 返回 null，只取页面和文明加成两类条目。
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useMemo: (f: () => unknown) => f() }));
vi.mock('../../src/data/hooks', () => ({ useCore: () => null }));
const RELEASE: string = '../../scripts/release.mjs';
const { findReleaseCommit } = (await import(RELEASE)) as { findReleaseCommit: (rel: string, main: string, cwd?: string) => string | null };
const { useSearchIndex } = await import('../../src/features/search/hooks');

const FALLBACK = '（数据读不准，按通用速度算）';
const bon = (en: string) => civs.find((c) => c.en === en)!.bon as string[];
const paren = (s: string) => s.slice(s.lastIndexOf('（') + 1, -1);

/**
 * A 的 7 个文明：未计入行的 label（当前 gatherModel 输出，规则不变）→ civs.json bon 原文（逐字引用）
 * 和原因里至少应出现的关键词（按原文归纳）。高棉的 bon 里没有任何采集相关原文，见 A4。
 */
const A_CASES = [
  { en: 'Malians', zh: '马里', labels: ['采金加成'], bon: ['村民存放的黄金额外 +10%'], noTech: true },
  { en: 'Poles', zh: '波兰', labels: ['波兰庄园农田加成', '波兰采石换金'], bon: ['大庄园替代磨坊', '石矿工不仅能产生石料，还能产生黄金'], noTech: false },
  { en: 'Portuguese', zh: '葡萄牙', labels: ['采浆果同时产木头'], bon: ['采果工不仅能产生食物，还能产生木材'], noTech: true },
  { en: 'Shu', zh: '蜀', labels: ['伐木同时产食物'], bon: ['伐木工不仅能产生木材，还能产生食物'], noTech: true },
  { en: 'Sicilians', zh: '西西里', labels: ['农田食物储量'], bon: ['农田升级提供的食物 +125%'], noTech: false },
  { en: 'Khmer', zh: '高棉', labels: ['农田采集 −5%'], bon: ['农民不需要磨坊或城镇中心就可以存放食物'], noTech: true },
  { en: 'Aztecs', zh: '阿兹特克', labels: ['村民携带量'], bon: ['村民携带量 +3'], noTech: true },
] as const;

describe('A #162 7 个文明的「未计入」原因写到具体文明', () => {
  for (const c of A_CASES) {
    it(`A0 夹具自检 ${c.zh}：label 与 civs.json 原文和当前规则一致`, () => {
      for (const t of c.bon) expect(bon(c.en)).toContain(t);
      for (const age of [1, 2, 3, 4]) expect([...new Set(gatherModel(age, c.en).unsupported.map((l) => l.label))]).toEqual(c.labels);
    });

    it(`A1 ${c.zh}：每条未计入行不再是兜底原因，原因以「未建模」收尾`, () => {
      for (const label of c.labels) {
        const s = uncountedText(c.en, c.zh, label);
        expect(s.startsWith(`未计入：${c.zh} ${label}（`), s).toBe(true);
        expect(s, s).not.toContain(FALLBACK);
        expect(paren(s), s).toMatch(/未建模$/);
      }
    });

    it(`A2 ${c.zh}：原因与 civs.json 原文不矛盾（原文不涉及科技/时代的不写「需研究科技」「按时代变化」）`, () => {
      for (const label of c.labels) {
        const r = paren(uncountedText(c.en, c.zh, label));
        if (c.noTech) expect(r, r).not.toContain('需研究科技');
        if (!c.bon.some((t) => /时代/.test(t))) expect(r, r).not.toContain('按时代变化');
      }
    });

    it(`A3 ${c.zh}：不计入规则不变，applied 为空、速度等于通用`, () => {
      for (const age of [1, 2, 3, 4]) {
        const g = gatherModel(age, c.en);
        expect(g.applied).toEqual([]);
        expect(g.rate).toEqual(gatherModel(age).rate);
      }
    });
  }

  it('A4 高棉：civs.json bon 只有「农民不需要磨坊或城镇中心就可以存放食物」，没有 −5% 原文，原因不得写数字', () => {
    expect(bon('Khmer').some((b) => /%/.test(b) && /农|采集/.test(b))).toBe(false);
    const r = paren(uncountedText('Khmer', '高棉', '农田采集 −5%'));
    expect(r).not.toMatch(/\d/);
  });

  it('A6 波兰 4 条未计入行按各自加成写原因：大庄园行与采石行不同', () => {
    const rows = gatherModel(4, 'Poles').unsupported.map((l) => uncountedText('Poles', '波兰', l.label));
    expect(rows).toHaveLength(4);
    expect(rows.filter((s) => s.includes('波兰庄园农田加成'))).toEqual(Array(3).fill('未计入：波兰 波兰庄园农田加成（大庄园替代磨坊，未建模）'));
    expect(rows.filter((s) => s.includes('波兰采石换金'))).toEqual(['未计入：波兰 波兰采石换金（石矿工兼产黄金，未建模）']);
  });

  it('A5 范围外文明不受影响：亚美尼亚/波希米亚/玛雅原因不变，未知文明仍兜底', () => {
    expect(uncountedText('Armenians', '亚美尼亚', '伐木 +7%')).toBe('未计入：亚美尼亚 伐木 +7%（需研究科技，未建模）');
    expect(uncountedText('Bohemians', '波希米亚', '村民移速 +15%')).toBe('未计入：波希米亚 村民移速 +15%（需研究科技，未建模）');
    expect(uncountedText('Mayans', '玛雅', '采金 −13%')).toContain('（资源多持续 15%，不是采集变快，暂不计入）');
    expect(uncountedText('NoSuchCiv', '某文明', 'x')).toBe(`未计入：某文明 x${FALLBACK}`);
  });
});

describe('B #162 文明加成与页面也支持拼音命中，排序同 #159', () => {
  const idx = useSearchIndex();
  const pages = idx.filter((i) => i.kind === 'page');
  const bonuses = idx.filter((i) => i.kind === 'bonus');

  it('B0 夹具自检：索引里有页面和文明加成两类', () => {
    expect(pages.length).toBeGreaterThan(5);
    expect(bonuses.length).toBeGreaterThan(100);
    expect(pages.map((p) => p.zh)).toContain('科技树');
    expect(bonuses.map((b) => b.zh)).toContain('村民携带量 +3');
  });

  it('B1 每个页面和文明加成条目都带 py/pyi（含中文时）', () => {
    const missing = [...pages, ...bonuses].filter((i) => /[\u4e00-\u9fff]/.test(i.zh) && !(i.py && i.pyi)).map((i) => `${i.kind}:${i.zh}`);
    expect(missing.slice(0, 5), `${missing.length} 条缺拼音`).toEqual([]);
  });

  it.each([
    ['kejishu', 'page', '科技树'],
    ['kjs', 'page', '科技树'],
    ['wenmingjiacheng', 'page', '文明加成'],
    ['cunminxiedailiang', 'bonus', '村民携带量 +3'],
    ['cmxdl', 'bonus', '村民携带量 +3'],
  ] as const)('B2 拼音「%s」命中 %s「%s」', (q, kind, zh) => {
    const hit = search(idx, q).find((i) => i.kind === kind && i.zh === zh);
    expect(hit, `${q} → ${zh}`).toBeDefined();
    expect(score(hit!, q)).toBe(TIER.py);
  });

  it('B3 纯拼音查询（无文字命中）：「cunmin」拼音命中的加成可填满 limit=10（同 v0.9.0 E5）', () => {
    const q = 'cunmin';
    expect(idx.filter((r) => score(r, q) > TIER.py)).toEqual([]);
    expect(idx.filter((r) => score(r, q) === TIER.py && r.kind === 'bonus').length).toBeGreaterThanOrEqual(10);
    const r = search(idx, q, 10);
    expect(r).toHaveLength(10);
    expect(r.every((x) => score(x, q) === TIER.py)).toBe(true);
    expect(r.some((x) => x.kind === 'bonus')).toBe(true);
  });

  it('B3a 有文字命中竞争时：加成拼音最多 5 条，紧跟精确/前缀文字命中（#159）', () => {
    const q = 'bu'; // 34 条文字命中、19 条加成拼音命中
    const text = idx.filter((r) => score(r, q) > TIER.py);
    expect(text.length, '夹具：cun 需有文字命中').toBeGreaterThan(0);
    const tiers = search(idx, q).map((r) => score(r, q));
    const firstPy = tiers.indexOf(TIER.py);
    expect(firstPy).toBeGreaterThan(0);
    expect(firstPy).toBe(Math.max(1, tiers.slice(0, firstPy).filter((t) => t >= TIER.prefix).length));
    let end = firstPy;
    while (end < tiers.length && tiers[end] === TIER.py) end++;
    expect(end - firstPy, '拼音足够多时恰好 5 条').toBe(5);
    expect(search(idx, q).filter((r) => score(r, q) === TIER.py).some((r) => r.kind === 'bonus')).toBe(true);
  });

  it('B3b 构造：页面精确命中、加成拼音 7 条、文字子串 3 条，顺序为 精确 | 5 拼音 | 3 文字 | 2 拼音', () => {
    const mk = (id: string, f: Partial<SearchItem>): SearchItem => ({ kind: 'bonus', id, zh: id, en: '', href: '', sub: '', ...f });
    const exactPage = mk('p', { kind: 'page', zh: '页', en: 'cun' });
    const py = Array.from({ length: 7 }, (_, i) => mk(`b${i}`, { zh: `村民${i}`, py: 'cunmin', pyi: 'cm' }));
    const sub = Array.from({ length: 3 }, (_, i) => mk(`s${i}`, { en: `xcun${i}` }));
    const ids = search([...sub, ...py, exactPage], 'cun').map((r) => r.id);
    expect(ids).toEqual(['p', 'b0', 'b1', 'b2', 'b3', 'b4', 's0', 's1', 's2', 'b5', 'b6']);
  });

  it('B4 中文和英文照旧：「科技树」「Tech Tree」仍是精确命中排第一', () => {
    expect(search(idx, '科技树')[0]?.zh).toBe('科技树');
    expect(search(idx, 'Tech Tree')[0]?.zh).toBe('科技树');
  });
});

describe('C #162 findReleaseCommit 在手动 fast-forward 后也找对发版提交', () => {
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
  const repo = () => {
    const d = mkdtempSync(join(tmpdir(), 'rel-'));
    git(d, 'init', '-q', '-b', 'main');
    git(d, 'config', 'user.email', 't@t');
    git(d, 'config', 'user.name', 't');
    const commit = (m: string) => {
      writeFileSync(join(d, m), m);
      git(d, 'add', '.');
      git(d, 'commit', '-qm', m);
      return git(d, 'rev-parse', 'HEAD');
    };
    return { d, commit };
  };

  it('C0 夹具自检：临时仓库可建', () => {
    const { d, commit } = repo();
    expect(commit('a')).toMatch(/^[0-9a-f]{40}$/);
    rmSync(d, { recursive: true, force: true });
  });

  it('C1 fast-forward 后 main 又有新提交：返回 release 头部，不是之后的第一个 main 提交', () => {
    const { d, commit } = repo();
    commit('base');
    git(d, 'checkout', '-qb', 'release');
    const rel = commit('rel');
    git(d, 'checkout', '-q', 'main');
    git(d, 'merge', '-q', '--ff-only', 'release');
    commit('after-1');
    const head = commit('after-2');
    expect(findReleaseCommit(rel, head, d)).toBe(rel);
    rmSync(d, { recursive: true, force: true });
  });

  it('C2 fast-forward 且 main 无新提交：返回 release 头部', () => {
    const { d, commit } = repo();
    commit('base');
    git(d, 'checkout', '-qb', 'release');
    const rel = commit('rel');
    git(d, 'checkout', '-q', 'main');
    git(d, 'merge', '-q', '--ff-only', 'release');
    expect(findReleaseCommit(rel, git(d, 'rev-parse', 'HEAD'), d)).toBe(rel);
    rmSync(d, { recursive: true, force: true });
  });

  it('C3 回归：正常 merge commit 后又有提交，仍返回合并提交', () => {
    const { d, commit } = repo();
    commit('base');
    git(d, 'checkout', '-qb', 'release');
    const rel = commit('rel');
    git(d, 'checkout', '-q', 'main');
    commit('main-side');
    git(d, 'merge', '-q', '--no-ff', '-m', 'merge', 'release');
    const merge = git(d, 'rev-parse', 'HEAD');
    const head = commit('after');
    expect(findReleaseCommit(rel, head, d)).toBe(merge);
    rmSync(d, { recursive: true, force: true });
  });

  it('C4 未合入：返回 null', () => {
    const { d, commit } = repo();
    commit('base');
    git(d, 'checkout', '-qb', 'release');
    const rel = commit('rel');
    git(d, 'checkout', '-q', 'main');
    const head = commit('main-only');
    expect(findReleaseCommit(rel, head, d)).toBeNull();
    rmSync(d, { recursive: true, force: true });
  });
});
