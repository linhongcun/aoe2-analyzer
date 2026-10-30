// v0.30.0 #289 验收：formatTime 拆分 / 缓存后每个文件 <20 秒；civ42v070:74（A3 送马）显式 20_000 超时；vitest 墙钟 <60 秒；不改变任何断言。Kent Beck 2026-10-22。
// 验收标准（#289 原文）：
//   - 把 formatTime.test.ts 按文明拆成多个文件，或者共享缓存的模拟结果，让每个文件都低于 20 秒
//   - 给 civ42v070.test.ts:74 显式设置 20_000 的超时，或者在 describe 级别缓存
//   - CI 里 vitest 墙钟时间低于 60 秒，在 PR 里贴出改动前后的耗时
//   - 不改变任何断言（AGENTS.md:79）
// f856c9e 实测（本机 8 核，北京时间 2026-10-22 约 09:35，见 __fixtures__/v0300-289-baseline.json）：全量墙钟 93 秒；formatTime.test.ts 55.3 秒；civ42v070.test.ts 13.1 秒，A3 送马 1057 ms。
// 计时那条要跑一遍全量，默认跳过；V0300_289_TIMING=1 npx vitest run tests/unit/v0300-289.test.ts 才跑（f856c9e 上红：formatTime 单文件 >20 秒、全量 >60 秒）。
// 注意：全量墙钟里 v0300-289 只有 2 条红；但全量里还有其他 v0.30.0 验收红用例，「0 失败」不在这里要求，只要求 formatTime / civ42v070 原用例全部通过。
// [待 Steve] 「CI 里」墙钟以哪台机器为准？本条在本机测；另外 v0.30.0 的验收文件本身（如 v0300-331 约 30 秒）也计入全量墙钟。
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, WALK, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import baseline from './__fixtures__/v0300-289-baseline.json' with { type: 'json' };

const DIR = 'tests/unit';
const read = (f: string) => readFileSync(`${DIR}/${f}`, 'utf8');
const formatFiles = () => readdirSync(DIR).filter((f) => /^formatTime.*\.test\.ts$/.test(f));
/** 拆分后可能把公共代码放进 tests/unit 下的非 .test.ts 帮助文件（含子目录），一并扫描 */
function helperFiles(dir = DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('__') ? [] : helperFiles(p);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) && !/^setup/.test(e.name) ? [p] : [];
  });
}
/** 去掉注释；字符串字面量以外的空白全部去掉（字面量里的空白保留，'3 人' 与 '3人' 不同） */
function canon(src: string): string {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  return noComments.replace(/('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|\s+/g, (...g: (string | undefined)[]) => g[1] ?? '');
}
/** 规范化后源码里的循环头 for(...) 与 it.each(...)：覆盖面（开局 × 文明 × 建房 × 距离）不能缩小 */
function loops(src: string): string[] {
  const s = canon(src);
  const out: string[] = [];
  for (const m of s.matchAll(/for\(|it\.each\(/g)) {
    let depth = 0;
    let k = m.index! + m[0].length - 1;
    for (; k < s.length; k++) {
      if (s[k] === '(') depth++;
      else if (s[k] === ')' && --depth === 0) break;
    }
    out.push(s.slice(m.index!, k + 1));
  }
  return out;
}
/** 规范化后源码里每条 expect(...) 语句（到分号或括号失衡为止） */
function expects(src: string): string[] {
  const s = canon(src);
  const out: string[] = [];
  for (let i = s.indexOf('expect('); i >= 0; i = s.indexOf('expect(', i + 1)) {
    let depth = 0;
    let k = i;
    for (; k < s.length; k++) {
      const c = s[k]!;
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c) && --depth < 0) break;
      else if (c === ';' && depth === 0) break;
    }
    out.push(s.slice(i, k));
  }
  return out;
}
const SRC = baseline.sources as Record<'formatTime.test.ts' | 'civ42v070.test.ts', string>;
/** Only #197's explicitly approved final-civ C section is migrated; A/B/D remain protected. */
function beforeMigratedC(src: string): string {
  const markers = [...src.matchAll(/^describe\('C 白名单',/gm)];
  expect(markers, '原始/当前文件均须恰有一个顶层C段').toHaveLength(1);
  return src.slice(0, markers[0]!.index);
}
const protectedSource = (file: string, src: string) => (file === 'civ42v070.test.ts' ? beforeMigratedC(src) : src);

describe('#289 civ42v070 A3 送马有余量', () => {
  it('A3 守护（civ42v070.test.ts 原 74 行）显式 20_000 超时，或在 describe 级别缓存了模拟结果', () => {
    const src = canon(read('civ42v070.test.ts'));
    const at = src.indexOf("it('A3 守护：送马");
    expect(at, '用例还在').toBeGreaterThan(0);
    const rest = src.slice(at + 3);
    const end = rest.search(/(^|[;}])(it|it\.each|describe)\(/);
    const body = rest.slice(0, end < 0 ? undefined : end);
    const timeout = /\},20_?000\)$/.test(body.replace(/;$/, '')) || /\{timeout:20_?000\}/.test(body);
    // describe 级缓存：文件里有 beforeAll / cache / memo，且 A3 用例体不再自己调用 simulateBuild
    const cached = /beforeAll\(|newMap|memo|cache/i.test(src) && !body.includes('simulateBuild(');
    expect(timeout || cached, '20_000 超时或 describe 级缓存').toBe(true);
  });
});

describe('#289 formatTime 拆分或共享缓存', () => {
  it('[启发式] formatTime*.test.ts 不止一个文件，或用了共享缓存（formatTime 文件或 tests/unit 帮助文件里有 Map / memo / cache / beforeAll）', () => {
    const files = formatFiles();
    const text = [...files.map(read), ...helperFiles().map((p) => readFileSync(p, 'utf8'))].map(canon).join('\n');
    const cached =
      files.length === 1 && /beforeAll\(|newMap|memo|cache/i.test(canon(read(files[0]!))) ? true : /(newMap|memo|cache)[\s\S]{0,400}simulateBuild/i.test(text);
    expect(files.length > 1 || cached, files.join(',')).toBe(true);
  });
});

describe('#289 对照：不改变任何断言', () => {
  it('f856c9e 的 formatTime.test.ts 与 civ42v070.test.ts 的每条 expect(...)（去注释、字面量外去空白）仍出现在现有文件里', () => {
    const helpers = helperFiles().map((p) => readFileSync(p, 'utf8'));
    const now = {
      'formatTime.test.ts': [...formatFiles().map(read), ...helpers].map(canon).join('\n'),
      'civ42v070.test.ts': [read('civ42v070.test.ts'), ...helpers].map(canon).join('\n'),
    };
    const all = Object.entries(SRC).flatMap(([f, src]) => expects(src).map((e) => [f, e] as const));
    expect(all.length, '防空转').toBeGreaterThanOrEqual(50);
    // 原56条计数不缩小；其中C段的9条旧未支持断言已获授权迁移，余下47条逐条保护。
    const retained = Object.entries(SRC).flatMap(([file, src]) => expects(protectedSource(file, src)).map((statement) => [file, statement] as const));
    expect(retained).toHaveLength(47);
    const retainedNow = { ...now, 'civ42v070.test.ts': canon(beforeMigratedC(read('civ42v070.test.ts'))) };
    expect(
      retained
        .filter(([file, statement]) => !retainedNow[file as keyof typeof retainedNow].includes(statement))
        .map(([file, statement]) => `${file}: ${statement}`),
    ).toEqual([]);
  });
  it('f856c9e 的循环头 for(...) / it.each(...) 都还在（不缩小开局 × 文明 × 建房 × 距离的覆盖面）', () => {
    const helpers = helperFiles().map((p) => readFileSync(p, 'utf8'));
    const all = Object.values(SRC).flatMap(loops);
    expect(all.length, '防空转').toBeGreaterThanOrEqual(5);
    const retained = Object.entries(SRC).flatMap(([file, src]) => loops(protectedSource(file, src)));
    const retainedNow = [...formatFiles().map(read), beforeMigratedC(read('civ42v070.test.ts')), ...helpers].map(canon).join('\n');
    expect(retained.length).toBeGreaterThanOrEqual(5);
    expect(retained.filter((loop) => !retainedNow.includes(loop))).toEqual([]);
  });
  it('对照自检：注释掉的断言不算数', () => {
    expect(canon("// expect(a).toBe(1);\nexpect(b).toBe('3 人');")).toBe("expect(b).toBe('3 人');");
  });
  it('模拟数值不变：全部开局 × 通用、匈奴、印加 × 自动建房开关 × 默认距离，升时代时刻与每步库存的哈希（f856c9e 值）', () => {
    const UPS = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
    const h = createHash('sha256');
    for (const bo of buildOrders)
      for (const civ of ['Generic', 'Huns', 'Incas'])
        for (const autoHouses of [true, false]) {
          const tl = simulateBuild(bo, civ, eco as unknown as EcoData, UPS, { walkTiles: WALK.default, autoHouses });
          h.update(JSON.stringify([bo.id, civ, autoHouses, tl.ageUps, tl.steps.map((s) => [s.doneAt, s.villagers, s.stock, s.pop])]));
        }
    expect(h.digest('hex')).toMatchInlineSnapshot(`"7e4f2d1a61c510f73fa9af1215afe614807157a382dfae8fbb1a309336284066"`);
  }, 30_000);
});

const sh = (args: string[]) =>
  new Promise<{ code: number | null; secs: number }>((resolve) => {
    const t0 = Date.now();
    // 异步子进程：同步等待会卡住本 worker，vitest 报 onTaskUpdate 超时
    spawn('npx', args, { stdio: 'ignore', env: { ...process.env, V0300_289_TIMING: '' } }).on('exit', (code) =>
      resolve({ code, secs: (Date.now() - t0) / 1000 }),
    );
  });

describe.runIf(process.env.V0300_289_TIMING === '1')('#289 计时（全量跑一遍；V0300_289_TIMING=1 才跑）', () => {
  it('每个 formatTime*.test.ts 单独跑（含收集与 beforeAll）<20 秒；全量 vitest 墙钟 <60 秒；f856c9e 的 formatTime / civ42v070 用例名全部还在且通过', async () => {
    const slow: [string, number][] = [];
    for (const f of formatFiles()) {
      const r = await sh(['vitest', 'run', `${DIR}/${f}`]);
      if (r.secs >= 20) slow.push([f, Math.round(r.secs)]);
    }
    const out = join(mkdtempSync(join(tmpdir(), 'v0300-289-')), 'report.json');
    // 全量含本文件（子进程里本块跳过），墙钟按真实全量算
    const full = await sh(['vitest', 'run', '--reporter=json', `--outputFile=${out}`]);
    type R = { name: string; assertionResults: { ancestorTitles: string[]; title: string; status: string }[] };
    const res = JSON.parse(readFileSync(out, 'utf8')) as { testResults: R[] };
    const passed = new Set(
      res.testResults
        .filter((r) => /\/(formatTime[^/]*|civ42v070)\.test\.ts$/.test(r.name))
        .flatMap((r) => r.assertionResults.filter((a) => a.status === 'passed').map((a) => [...a.ancestorTitles, a.title].join(' > '))),
    );
    const lost = Object.entries(baseline.tests)
      .flatMap(([file, names]) => names.filter((name) => !(file === 'civ42v070.test.ts' && name.startsWith('C 白名单 > '))))
      .filter((name) => !passed.has(name));
    expect({ wall: Math.round(full.secs), slow, lostCount: lost.length, lost: lost.slice(0, 5) }).toEqual({
      wall: expect.any(Number),
      slow: [],
      lostCount: 0,
      lost: [],
    });
    expect(full.secs, '全量墙钟（秒）').toBeLessThan(60);
  }, 900_000);
});
