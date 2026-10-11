/**
 * 生成 docs/EFFECTS-AUDIT.md：.dat 生成效果 vs 历史手工规则的逐条差异。
 * 运行：npx vite-node scripts/effects_audit.ts   （需先 python3 scripts/effects_build.py）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import unitsRaw from '../src/data/units.json';
import bldRaw from '../src/data/buildings.json';
import civsRaw from '../src/data/civs.json';
import techsRaw from '../src/data/techs.json';
import treesRaw from '../src/data/trees.json';
import { MANUAL_BUILDING_CIV_BONUSES, MANUAL_BUILDING_EFFECTS } from '../src/domain/buildingEffects.manual';
import { MANUAL_CIV_BONUSES, MANUAL_TECH_EFFECTS, MANUAL_TEAM_BONUSES } from '../src/domain/effects.manual';
import { DAT, toEffects, type DatRule } from '../src/domain/datEffects';
import { BONUS_SRC, GENERIC_FX, NEW_IDS, TECH_SRC, bonusCoverage, genericFx } from '../src/domain/effects';
import { buildingBase } from '../src/domain/buildingSim';
import { applyEffects, baseStats } from '../src/domain/simulator';
import type { Building, Effect, StatSet, Unit } from '../src/domain/types';

const units = unitsRaw as unknown as Unit[];
const blds = bldRaw as unknown as Building[];
const civs = civsRaw as unknown as { en: string; zh: string; bon: string[]; bonEn: string[]; tb: string; tbEn: string }[];
const techs = techsRaw as unknown as { id: number; en: string; zh: string; type: string; descEn: string }[];
type Obj = { id: number; en: string; zh: string };
const objs: [Obj, boolean][] = [...units.map((u) => [u, false] as [Obj, boolean]), ...blds.map((b) => [b, true] as [Obj, boolean])];
const treeT = (treesRaw as unknown as { t: Record<string, [number, number, number, [number, number, string, number, number, number | null][]][]> }).t;
const AVAIL: Record<string, Set<number>> = {};
Object.entries(treeT).forEach(([c, bl]) => (AVAIL[c] = new Set(bl.flatMap((b) => b[3].filter((e) => e[2] === 'u' && e[4] === 1).map((e) => e[3])))));
const inAnyTree = new Set(Object.values(AVAIL).flatMap((s) => [...s]));
/** 只比较该文明能训练的单位（建筑与不在任何科技树里的单位一律保留） */
const civCan = (civ: string, o: Obj, b: boolean) => b || !inAnyTree.has(o.id) || !AVAIL[civ] || AVAIL[civ]!.has(o.id);
const nm = (o: Obj) => `${o.zh}(${o.en})`;

const KEYS = ['hp', 'atk', 'ma', 'pa', 'rng', 'spd', 'los', 'rof', 'acc', 'minr', 'gar', 'bt', 'barm'] as const;
function result(o: Obj, b: boolean, ef: Effect[]): Record<string, number> {
  const S: StatSet = b ? buildingBase(o as Building) : baseStats(o as Unit);
  const base: StatSet = { ...S, bonus: { ...S.bonus } };
  applyEffects(S, ef);
  S.rof = S.rof / S.rofx;
  const r: Record<string, number> = {};
  KEYS.forEach((k) => {
    const d = S[k] - base[k];
    if (Math.abs(d) > 0.05) r[k] = Math.round(d * 100) / 100;
  });
  Object.entries(S.bonus).forEach(([k, v]) => {
    const d = v - (base.bonus[k] ?? 0);
    if (Math.abs(d) > 1e-6) r['vs ' + k] = Math.round(d * 1000) / 1000;
  });
  return r;
}
const fmt = (r: Record<string, number>) =>
  Object.entries(r)
    .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`)
    .join(', ') || '—';
/** 浮点累乘误差（如 ×1.0999）不算差异：每项差 ≤ max(0.05, 0.1%) */
const same = (a: Record<string, number>, b: Record<string, number>) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every(
    (k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) <= Math.max(0.051, Math.abs(a[k] ?? b[k] ?? 0) * 0.001),
  );
const datRuleFx = (rules: DatRule[], x: Obj) => rules.filter((r) => r.t.includes(x.id)).flatMap((r) => toEffects(r.fx));

const out: string[] = [];
const P = (s = '') => out.push(s);
const mm = { tech: 0, civ: 0, team: 0 };

// ---------------- 头部 ----------------
const cov = bonusCoverage();
P('# 效果审计：.dat 原始效果 vs 历史手工规则');
P();
P('> 本文件由 `scripts/effects_audit.ts` 生成（`npx vite-node scripts/effects_audit.ts`），请勿手改。');
P();
P('## 数据源与新鲜度');
P();
P('| 源 | 仓库@提交 | 文件 | 对应补丁 | 用途 |');
P('|---|---|---|---|---|');
DAT.meta.sources.forEach((s) => P(`| ${s.id} | ${s.repo}@${s.commit} | \`${s.file}\` | ${s.patch} | ${s.use} |`));
P();
P(
  `- 源 A 是唯一公开、含**全部** EffectCommands 的 DE .dat 转储，但停在 2025-06（DE Update 147949）；其后 5 个补丁（162286 / 169123 / 170934 / 177723 / 185872）与 6 个新文明（Danes、Mapuche、Muisca、Saxons、Tupi、Varangians）不在其中。`,
);
P(
  `- 源 B 是当前补丁（2026-10-03）由 genieutils 读取的快照，56 文明齐全，但只保留经济/费用类命令；用来校验科技 id 是否仍是同一科技（内部名比对），并提供当前的经济数值。`,
);
P(`- 同一 tech id 在 A、B 内部名不同（id 被重用或新增）→ 视为 A 无战斗数据（\`combat=false\`），回退手工表。`);
P(
  `- **新鲜度检查**：每条加成把 .dat 累计数值（按时代）与当前补丁的游戏内加成文本（civs.json，来自当前 aoe2techtree 字符串）里的数字比对；不一致即判定 A 已过时，回退手工表/文本。`,
);
P(
  `- 源 A 中不存在的单位/建筑（${NEW_IDS.size} 个：${[...NEW_IDS].map((i) => objs.find(([o]) => o.id === i)![0].en).join('、')}）：科技/加成对它们的作用范围沿用手工判定。`,
);
P();
P('## 覆盖率');
P();
const manualCount = Object.values(MANUAL_CIV_BONUSES).flat().length,
  manualIdx = new Set([
    ...Object.entries(MANUAL_CIV_BONUSES).flatMap(([c, l]) => l.map((x) => c + x[3])),
    ...Object.entries(MANUAL_BUILDING_CIV_BONUSES).flatMap(([c, l]) => l.map((x) => c + x[3])),
  ]).size;
P(`| | 之前（手工） | 现在 |`);
P(`|---|---|---|`);
P(`| 加成条目总数（文明加成 + 团队加成） | ${cov.total} | ${cov.total} |`);
P(
  `| 数值编码（进模拟器/对比/作用对象） | ${manualIdx + MANUAL_TEAM_BONUSES.length}（${manualIdx} 条文明加成 + ${MANUAL_TEAM_BONUSES.length} 条团队加成） | **${cov.dat + cov.manual}**（.dat ${cov.dat} + 手工回退 ${cov.manual}） |`,
);
P(`| 仅经济/费用类 .dat 结构化效果（文本展示） | 0 | ${cov.eco} |`);
P(`| 仅文本 | ${cov.total - manualIdx - MANUAL_TEAM_BONUSES.length} | ${cov.text} |`);
const datTechs = Object.values(TECH_SRC).filter((s) => s === 'dat').length;
P(
  `| 数值编码的科技 | ${new Set([...Object.keys(MANUAL_TECH_EFFECTS), ...Object.keys(MANUAL_BUILDING_EFFECTS)]).size} | **${Object.keys(TECH_SRC).length}**（.dat ${datTechs} + 手工 ${Object.keys(TECH_SRC).length - datTechs}） |`,
);
P(`| 通用隐藏科技（时代自动/组合触发） | 0 | ${new Set(GENERIC_FX.map((g) => g.tech)).size} |`);
P();
P(`（手工 CivBonus 条目 ${manualCount} 个，按加成文本序号去重后 ${manualIdx} 条。）`);
P();

// ---------------- 科技 ----------------
P('## 一、科技：手工规则 vs .dat');
P();
P('对每个手工编码的科技，逐单位/建筑把两边效果套到基础属性上比较**最终增量**（因此 `+1 攻击` 与 `×1.x` 等价写法不算差异）。');
P('「.dat」侧含组合触发的通用隐藏科技（如 Arrowslits + Keep），不含新单位回退部分。');
P();
const allManualTechs = [...new Set([...Object.keys(MANUAL_TECH_EFFECTS), ...Object.keys(MANUAL_BUILDING_EFFECTS)])];
allManualTechs.forEach((en) => {
  const dt = DAT.techs[en];
  const lines: string[] = [];
  if (!dt || !dt.combat) {
    P(`### ${en} — 源 A 无此科技的战斗数据（${dt ? 'id 已被重用/新科技' : '不在 techs.json'}），继续使用手工规则`);
    P();
    mm.tech++;
    return;
  }
  const groups = new Map<string, string[]>();
  objs.forEach(([o, b]) => {
    if (NEW_IDS.has(o.id)) return;
    const man = b
      ? (MANUAL_BUILDING_EFFECTS[en] ?? []).filter(([f]) => f(o as Building)).flatMap((x) => x[1])
      : (MANUAL_TECH_EFFECTS[en] ?? []).filter(([f]) => f(o as Unit)).flatMap((x) => x[1]);
    const dat = [
      ...datRuleFx(dt.rules, o),
      ...GENERIC_FX.filter((g) => g.req.includes(en) && g.b === b && g.pred(o))
        .filter((g) => genericFx(o, b, 4, (t) => t === en).length && g.req.every((r) => r === en || r === o.en || (o.en === 'Keep' && r === 'Guard Tower')))
        .flatMap((g) => g.fx),
    ];
    if (!man.length && !dat.length) return;
    const a = result(o, b, man),
      d = result(o, b, dat);
    if (same(a, d)) return;
    const k = `手工 \`${fmt(a)}\` → .dat \`${fmt(d)}\``;
    groups.set(k, [...(groups.get(k) ?? []), nm(o)]);
  });
  if (!groups.size) return;
  mm.tech += groups.size;
  P(`### ${en}`);
  P();
  groups.forEach((l, k) => lines.push(`- ${k}：${l.slice(0, 12).join('、')}${l.length > 12 ? ` 等 ${l.length} 个` : ''}`));
  lines.forEach((l) => P(l));
  P();
});
P('### 由 .dat 新增数值编码的科技（之前仅文本或未编码）');
P();
P(
  Object.entries(TECH_SRC)
    .filter(([en, s]) => s === 'dat' && !allManualTechs.includes(en))
    .map(([en]) => en)
    .sort()
    .join('、'),
);
P();

// ---------------- 文明加成 ----------------
P('## 二、文明加成：手工规则 vs .dat');
P();
P('逐条（按加成文本序号）、逐单位/建筑、逐时代比较最终增量。「采用」列为现在模拟器使用的来源。');
P();
civs.forEach((c) => {
  const idxs = new Set([...(MANUAL_CIV_BONUSES[c.en] ?? []).map((x) => x[3]), ...(MANUAL_BUILDING_CIV_BONUSES[c.en] ?? []).map((x) => x[3])]);
  const d = DAT.civs[c.en];
  [...idxs].sort().forEach((i) => {
    const es = (d?.bonus ?? []).filter((e) => e.idx === i && !e.req.length && e.combat);
    const fresh = d?.fresh[String(i)];
    const used = BONUS_SRC[c.en]?.[String(i)];
    const groups = new Map<string, string[]>();
    objs.forEach(([o, b]) => {
      if (NEW_IDS.has(o.id) || !civCan(c.en, o, b)) return;
      const ml = b
        ? (MANUAL_BUILDING_CIV_BONUSES[c.en] ?? []).filter((x) => x[3] === i && x[0](o as Building))
        : (MANUAL_CIV_BONUSES[c.en] ?? []).filter((x) => x[3] === i && x[0](o as Unit));
      const de = es.filter((e) => e.rules.some((r) => r.t.includes(o.id)));
      if (!ml.length && !de.length) return;
      const diffs: string[] = [];
      [1, 2, 3, 4].forEach((a) => {
        const man = ml.flatMap((x) => x[1](a));
        const dat = de.filter((e) => e.age <= a).flatMap((e) => datRuleFx(e.rules, o));
        const ra = result(o, b, man),
          rd = result(o, b, dat);
        if (!same(ra, rd)) diffs.push(`时代${a}: 手工 \`${fmt(ra)}\` / .dat \`${fmt(rd)}\``);
      });
      if (diffs.length) groups.set(diffs.join('；'), [...(groups.get(diffs.join('；')) ?? []), nm(o)]);
    });
    const noDat = !d?.dat || !es.length;
    if (!groups.size && !noDat) return;
    mm.civ++;
    P(`### ${c.zh}（${c.en}）#${i}：${c.bon[i]}`);
    P();
    P(`- 英文原文：${c.bonEn[i]}`);
    P(`- .dat 条目：${es.map((e) => `${e.tech} \`${e.name}\`（时代 ${e.age}）`).join('；') || '无（源 A 无该文明/该加成的战斗命令）'}`);
    if (fresh)
      P(
        `- 新鲜度：${fresh.ok === false ? '**不一致**' : fresh.ok ? '吻合' : '无可比数值'}（.dat 累计 ${JSON.stringify(fresh.dat)}；文本数字 ${JSON.stringify(fresh.text)}）`,
      );
    P(`- 采用：**${used}**`);
    groups.forEach((l, k) => P(`- ${k}：${l.slice(0, 10).join('、')}${l.length > 10 ? ` 等 ${l.length} 个` : ''}`));
    P();
  });
});

// ---------------- 团队加成 ----------------
P('## 三、团队加成：手工规则 vs .dat');
P();
MANUAL_TEAM_BONUSES.forEach(([civ, label, f, fx]) => {
  const d = DAT.civs[civ];
  const groups = new Map<string, string[]>();
  units.forEach((u) => {
    if (NEW_IDS.has(u.id)) return;
    const man = f(u) ? fx : [];
    const dat = datRuleFx(
      (d?.team.rules ?? []).filter((r) => !r.b),
      u,
    );
    if (!man.length && !dat.length) return;
    const a = result(u, false, man),
      b = result(u, false, dat);
    if (same(a, b)) return;
    const k = `手工 \`${fmt(a)}\` → .dat \`${fmt(b)}\``;
    groups.set(k, [...(groups.get(k) ?? []), nm(u)]);
  });
  const noDat = !d?.dat;
  if (!groups.size && !noDat) return;
  mm.team++;
  P(`### ${label}`);
  P();
  P(`- 采用：**${BONUS_SRC[civ]?.team}**${noDat ? '（源 A 无该文明）' : ''}；新鲜度：${JSON.stringify(d?.fresh.team ?? null)}`);
  groups.forEach((l, k) => P(`- ${k}：${l.slice(0, 12).join('、')}${l.length > 12 ? ` 等 ${l.length} 个` : ''}`));
  P();
});

// ---------------- 新鲜度失败 ----------------
P('## 四、.dat（2025-06）与当前补丁文本不一致的加成（已回退）');
P();
P('| 文明 | 条目 | 当前文本 | .dat 累计值 | 现在采用 |');
P('|---|---|---|---|---|');
civs.forEach((c) =>
  Object.entries(DAT.civs[c.en]?.fresh ?? {}).forEach(([k, f]) => {
    if (f.ok !== false) return;
    P(`| ${c.zh} | ${k === 'team' ? '团队' : '#' + k} | ${k === 'team' ? c.tbEn : c.bonEn[+k]} | ${JSON.stringify(f.dat)} | ${BONUS_SRC[c.en]?.[k]} |`);
  }),
);
P();

// ---------------- lhc-aoe2 对账 ----------------
P('## 五、与 linhongcun/lhc-aoe2（作者本机 .dat，2026-08）科技数值对账');
P();
const lhcPath = 'scripts/.cache/lhc-unitTechFx.ts';
if (existsSync(lhcPath)) {
  const src = readFileSync(lhcPath, 'utf8');
  const lhc = JSON.parse(src.slice(src.indexOf('{', src.indexOf('= '))).replace(/;\s*$/, '')) as Record<string, Record<string, unknown>>;
  const MAP: Record<string, string> = {
    attack: 'atk',
    range: 'rng',
    lineOfSight: 'los',
    hp: 'hp',
    meleeArmor: 'ma',
    pierceArmor: 'pa',
    speedPct: 'spd%',
    attackSpeedPct: 'rof%',
  };
  const rows: string[] = [];
  let ok = 0,
    n = 0;
  techs.forEach((t) => {
    const slug = t.en
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-');
    const l = lhc[slug];
    const dt = DAT.techs[t.en];
    if (!l || !dt?.combat) return;
    const r = dt.rules.find((x) => !x.b);
    if (!r) return;
    const dv: Record<string, number> = {};
    r.fx.forEach((f) => {
      if (f.s === 'rof') dv['rof%'] = Math.round(f.v * 10000) / 100;
      else if (f.s === 'spd' && f.op === 'mul') dv['spd%'] = Math.round((f.v - 1) * 10000) / 100;
      else if (['atk', 'rng', 'los', 'hp', 'ma', 'pa'].includes(f.s) && (f.op ?? 'add') === 'add') dv[f.s] = f.v;
    });
    const lv: Record<string, number> = {};
    Object.entries(l).forEach(([k, v]) => MAP[k] && typeof v === 'number' && (lv[MAP[k]!] = v));
    const keys = [...new Set([...Object.keys(dv), ...Object.keys(lv)])].filter((k) => k in lv);
    if (!keys.length) return;
    n++;
    const bad = keys.filter((k) => Math.abs((dv[k] ?? 0) - lv[k]!) > 0.6);
    if (bad.length) rows.push(`| ${t.en} | ${bad.map((k) => `${k}: lhc ${lv[k]} / .dat(A) ${dv[k] ?? '—'}`).join('；')} |`);
    else ok++;
  });
  P(`可比科技 ${n} 个，一致 ${ok} 个；不一致（lhc 的「代表值」取自 2026-08 本机 .dat，A 为 2025-06）：`);
  P();
  P('| 科技 | 差异 |');
  P('|---|---|');
  rows.forEach((r) => P(r));
} else P('（未取得 lhc-aoe2 数据：私有仓库需 GITHUB_TOKEN；跳过对账）');
P();

// ---------------- 隐藏加成 ----------------
P('## 六、.dat 中存在、加成文本未列出的效果（已计入模拟器，标注为「隐藏加成」）');
P();
civs.forEach((c) =>
  (DAT.civs[c.en]?.bonus ?? [])
    .filter((e) => e.idx === null && e.rules.length && e.combat)
    .forEach((e) => P(`- ${c.zh}：${e.tech} \`${e.name}\` → ${e.rules.map((r) => `${r.t.length} 个目标 ${JSON.stringify(r.fx)}`).join('；')}`)),
);
P();
P('## 七、通用隐藏科技（所有文明，时代自动或组合触发）');
P();
DAT.generic.forEach((g) =>
  P(
    `- ${g.tech} \`${g.name}\`：时代 ≥ ${g.age}${g.req.length ? `，需 ${g.req.join(' + ')}` : ''} → ${g.rules.map((r) => `${r.t.length} 个目标 ${JSON.stringify(r.fx)}`).join('；')}`,
  ),
);
P();
P(`---`);
P(`差异小计：科技 ${mm.tech} 组、文明加成 ${mm.civ} 条、团队加成 ${mm.team} 条。`);
writeFileSync('docs/EFFECTS-AUDIT.md', out.join('\n') + '\n');
console.log('written', out.length, 'lines', mm, cov);
