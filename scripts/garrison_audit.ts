/** #1062: pinned, offline model audit. No game-client evidence is inferred. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import inputSchema from '../data/schemas/garrison-audit-input.json';
import sourcePin from '../data/sources/data_sources.json';
import { loadCore, loadTrees } from '../src/data';
import { AGE_TECH_IDS } from '../src/domain/gameIds';
import { GARRISON_TECH_DATA, implicitShapeTechs } from '../src/domain/garrisonTechs';
import {
  GENERAL_GARRISON_DATA as data,
  calculateGeneralGarrison,
  getFreeGarrisonTechs,
  readGeneralGarrison,
  unitGarrisonPower,
  writeGeneralGarrison,
  type GeneralGarrisonConfig,
  type GeneralGarrisonContext,
  type GeneralGarrisonRule,
  type GeneralGarrisonUnit,
} from '../src/domain/garrisonGeneral';
import type { Building } from '../src/domain/types';

export interface AuditInput {
  schemaVersion: number;
  issue: number;
  modelRevision: string;
  patch: number;
  datSha256: string;
  samples: { id: string; buildingId: number; config: GeneralGarrisonConfig; client: null }[];
}
const validate = new Ajv({ allErrors: true }).compile<AuditInput>(inputSchema);
export function validateInput(input: unknown): asserts input is AuditInput {
  if (!validate(input)) throw new Error(JSON.stringify(validate.errors));
  if (new Set(input.samples.map((s) => s.id)).size !== 30) throw new Error('Duplicate sample ID');
  if (input.patch !== sourcePin.patch.build || input.datSha256 !== data.meta.sha256)
    throw new Error('Audit pin differs from current data; do not silently upgrade evidence');
}
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fields = [
  'id',
  'type',
  'class',
  'attack',
  'reload',
  'firepower',
  'total',
  'max',
  'projectile',
  'secondaryProjectile',
  'capacity',
  'garrisonType',
  'sizeClass',
  'chargeType',
  'chargeEvent',
  'chargeProjectile',
  'maxCharge',
  'rechargeRate',
] as const;
function record(u: GeneralGarrisonUnit | undefined) {
  return u ? Object.fromEntries(fields.map((field) => [field, u[field]])) : null;
}

export function parseAuditUrl(url: string, b: Building, expected: GeneralGarrisonConfig) {
  const full = new URL(url);
  const route = new RegExp(`^#/building/${b.id}\\?(.+)$`).exec(full.hash);
  if (full.origin !== 'https://linhongcun.github.io' || full.pathname !== '/aoe2-analyzer/' || full.search || full.username || full.password || !route)
    throw new Error('Audit URL page identity differs');
  const params = new URLSearchParams(route[1]);
  const parsed = readGeneralGarrison(params, b);
  if (params.toString() !== writeGeneralGarrison(expected).toString() || parsed.errors.length || JSON.stringify(parsed.config) !== JSON.stringify(expected))
    throw new Error('Audit URL input differs');
  return parsed.config;
}

function replay(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig) {
  const civ = data.civs[config.civ]!;
  const units = structuredClone(data.units);
  for (const [key, u] of Object.entries(units)) Object.assign(u, structuredClone(civ.baseOverrides[key] ?? {}));
  const actual = data.buildings[b.id]?.eraForms[config.age - 1] ?? b.id;
  units[b.id] = { ...units[actual]!, id: b.id };
  const initial = structuredClone(units);
  const free = getFreeGarrisonTechs(ctx, b, config, data);
  const selected = [...new Set([...config.techs, ...free])];
  const implied = implicitShapeTechs(ctx, b, config, GARRISON_TECH_DATA);
  const known = new Set([104, ...implied]);
  if (b.id === 234 || b.id === 235) known.add(140);
  if (b.id === 235) known.add(63);
  const relevant = new Set([b.id, actual, ...config.rows.map((r) => r.unitId)]);
  for (const id of [...relevant]) {
    const u = units[id]!;
    for (const p of [u.projectile, u.secondaryProjectile, u.chargeProjectile]) if (p >= 0) relevant.add(p);
  }
  const rules: { phase: string; id: number; effects: { unit: number; stat: string; op: string; value: number; before: number; after: number }[] }[] = [];
  const appliedRuleIds: Record<string, number[]> = {};
  const apply = (rule: GeneralGarrisonRule, phase: string) => {
    const effects: (typeof rules)[number]['effects'] = [];
    for (const e of rule.effects) {
      const u = units[e.unit];
      if (!u) continue;
      const before = u[e.stat];
      u[e.stat] = e.op === 'set' ? e.value : e.op === 'mul' ? before * e.value : before + e.value;
      if (relevant.has(e.unit)) effects.push({ ...e, before, after: u[e.stat] });
    }
    (appliedRuleIds[phase] ??= []).push(rule.id);
    if (effects.length) rules.push({ phase, id: rule.id, effects });
  };
  for (const [index, id] of AGE_TECH_IDS.entries())
    if (config.age >= index + 2) {
      if (data.ageRules[id]) apply(data.ageRules[id]!, 'age');
      known.add(id);
    }
  const applied = new Set<number>();
  const automatic = [...civ.automatic];
  const advance = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const rule of automatic)
        if (!applied.has(rule.id) && !civ.disabled.includes(rule.id) && rule.requires.filter((id) => known.has(id)).length >= rule.count) {
          apply(rule, data.conditional.includes(rule) ? 'conditional' : 'automatic');
          applied.add(rule.id);
          known.add(rule.id);
          changed = true;
        }
    }
  };
  advance();
  for (const id of implied)
    if (!selected.includes(id) && data.techs[id]) {
      const rule = data.techs[id]!;
      apply({ ...rule, effects: rule.effects.filter((e) => units[e.unit]?.type === 60) }, 'implied-building-only');
    }
  for (const id of selected) {
    known.add(id);
    if (data.techs[id]) apply(data.techs[id]!, config.techs.includes(id) ? 'explicit' : 'free');
  }
  automatic.push(...data.conditional);
  advance();
  return {
    units,
    actual,
    free,
    implied,
    selected,
    known: [...known].sort((a, b) => a - b),
    rules,
    appliedRuleIds,
    fields: [...relevant]
      .sort((a, b) => a - b)
      .map((id) => ({
        id,
        raw: record(data.units[id]),
        civOverride: civ.baseOverrides[id] ?? null,
        afterCivAndEra: record(initial[id]),
        effective: record(units[id]),
      })),
  };
}

export async function buildAudit(input: unknown) {
  validateInput(input);
  const [core, trees] = await Promise.all([loadCore(), loadTrees()]);
  const ctx = { core, trees };
  const samples = input.samples.map((sample) => {
    const { config } = sample;
    const b = core.buildingById[sample.buildingId];
    if (!b) throw new Error(`${sample.id}: missing building`);
    const params = writeGeneralGarrison(config);
    const url = `https://linhongcun.github.io/aoe2-analyzer/#/building/${b.id}?${params.toString()}`;
    const parsed = parseAuditUrl(url, b, config);
    const result = calculateGeneralGarrison(ctx, b, parsed);
    if (result.errors.length || result.garrisonPower === null || result.buildingPower === null || result.buildingPower <= 0)
      throw new Error(`${sample.id}: invalid model result: ${result.errors.join(';')}`);
    const state = replay(ctx, b, config);
    const B = state.units[b.id]!;
    const powerAttack = B.secondaryProjectile >= 0 ? (state.units[B.secondaryProjectile]?.attack ?? B.attack) : B.attack;
    const buildingPower = powerAttack / B.reload;
    const contributions = config.rows.map((r) => {
      const u = state.units[r.unitId]!;
      const contribution = unitGarrisonPower(u, state.units);
      const visible = result.rows.find((v) => v.unitId === r.unitId);
      if (contribution.power === null || contribution.power !== visible?.powerEach) throw new Error(`${sample.id}: contribution replay differs`);
      const extra = Math.max(0, u.total - 1);
      const secondaryAttack = state.units[u.secondaryProjectile]?.attack ?? null;
      const power =
        u.firepower === 0
          ? 0
          : u.firepower < 0
            ? u.attack === 0
              ? -u.firepower
              : u.attack / u.reload - u.firepower
            : (u.firepower * (u.attack + (extra > 0 ? 0.8 * extra * secondaryAttack! : 0))) / u.reload;
      if (power !== contribution.power) throw new Error(`${sample.id}: unit formula replay differs`);
      return {
        unitId: r.unitId,
        count: Number(r.count),
        ...contribution,
        total: contribution.power * Number(r.count),
        extra,
        secondaryAttack,
        formula:
          u.firepower === 0
            ? '0'
            : u.firepower < 0
              ? u.attack === 0
                ? '-firepower'
                : 'attack/reload-firepower'
              : extra > 0
                ? 'firepower*(attack+0.8*(total-1)*secondary.attack)/reload'
                : 'attack*firepower/reload',
      };
    });
    const power = contributions.reduce((sum, r) => sum + r.total, 0);
    const ratio = power / buildingPower;
    const floor = Math.floor(ratio + 1e-9);
    const slots = Math.min(B.max, B.total + floor);
    const hasPrimary = B.projectile >= 0;
    const base = hasPrimary ? Math.max(1, Math.min(B.max, B.total)) : Math.max(0, Math.min(B.max, B.total) - 1);
    const total = hasPrimary ? Math.max(1, slots) : Math.max(0, slots - 1);
    const max = hasPrimary ? Math.max(1, B.max) : Math.max(0, B.max - 1);
    if (
      buildingPower !== result.buildingPower ||
      power !== result.garrisonPower ||
      total !== result.totalProjectiles ||
      base !== result.baseProjectiles ||
      max !== result.maxProjectiles ||
      B.capacity !== result.capacity
    )
      throw new Error(`${sample.id}: building replay differs`);
    return {
      ...sample,
      url,
      siteBuild: null,
      technology: {
        explicit: config.techs,
        free: state.free,
        implied: state.implied,
        selected: result.selected,
        knownNotAllApplied: state.known,
        appliedRuleIds: state.appliedRuleIds,
        relevantEffects: state.rules,
      },
      buildingShape: { requested: b.id, eraForm: state.actual },
      fields: state.fields,
      contributions,
      conversion: {
        formula:
          'buildingPower=(secondaryProjectile>=0?(secondary.attack??attack):attack)/reload; slots=min(max,total+floor(garrisonPower/buildingPower+1e-9)); primary?max(1,slots):max(0,slots-1)',
        powerAttack,
        buildingPower,
        garrisonPower: power,
        ratio,
        epsilon: 1e-9,
        floor,
        uncappedSlots: B.total + floor,
        cappedSlots: slots,
        hasPrimary,
      },
      model: result,
      evidence: {
        sourceExtraction: '固定.dat生成器--check与输入指纹核对；不是客户端观察',
        codeInput: 'URL反解、有效字段与贡献/换算回放等于公开计算器；共源模型，不是独立引擎验证',
        clientObservation: '未取得DE188329同条件可数客户端证据',
        status: '未核实（仅模型）',
        gaps: [
          '188329客户端版本与目标配置证据',
          '站内实际构建身份/页脚',
          '文明/时代/全部已生效科技与入驻配置',
          '目标/距离/合法攻击条件、普通/充能状态、模组与场景修改说明',
          '至少两次稳定齐射的可计数帧/时间定位、观察者与日期',
        ],
      },
    };
  });
  return {
    meta: {
      issue: 1062,
      patch: input.patch,
      datSha256: input.datSha256,
      modelRevision: input.modelRevision,
      sourcePin: { patch: sourcePin.patch, sources: sourcePin.sources },
      engineVerifiedInPinnedBuild: false,
      siteBuild: null,
      sourceCommand: 'python3 scripts/garrison_general_build.py --check',
      reproduce: 'npx vite-node --script scripts/garrison_audit.ts --check',
      boundary: '仓库阶段性产物，无网站发布；30项均缺客户端证据，AC3/AC4未完成。',
      rawBoundary: 'raw为固定.dat生成JSON的基础记录，不是未转换的.dat命令；文明override、科技效果亦为生成器解码结果。内部有效字段回放未由公开API逐字段证明。',
      generatedLocations: {
        units: 'data/game/garrison_general.json#/units/<id>',
        overrides: 'data/game/garrison_general.json#/civs/<civ>/baseOverrides/<id>',
        rules: 'data/game/garrison_general.json#/(ageRules|techs|conditional|civs/<civ>/automatic)；以phase/id定位，effects为相关目标子集',
        unitUpgradeTechs: 'data/game/garrison_techs.json#/unitUpgradeTechs',
      },
      fieldPaths: {
        attack: 'type_50.attacks[class_=3].amount (absent class => 0)',
        reload: 'type_50.reload_time',
        firepower: 'type_50.garrison_firepower',
        total: 'creatable.total_projectiles',
        max: 'creatable.max_total_projectiles',
        projectile: 'type_50.projectile_unit_id',
        secondaryProjectile: 'creatable.secondary_projectile_unit',
        capacity: 'garrison_capacity',
      },
    },
    samples,
  };
}

export async function runAudit(check: boolean, root = process.cwd()) {
  const inputPath = resolve(root, 'data/sources/garrison_audit.json');
  const input: unknown = JSON.parse(readFileSync(inputPath, 'utf8'));
  validateInput(input);
  const paths = execFileSync(
    'git',
    [
      'ls-tree',
      '-r',
      '--name-only',
      input.modelRevision,
      '--',
      'src',
      'data/game',
      'data/sources/data_sources.json',
      'scripts/garrison_general_build.py',
      'scripts/dat_source.py',
      'scripts/effects_build.py',
    ],
    { cwd: root, encoding: 'utf8' },
  )
    .trim()
    .split('\n');
  const fingerprints = Object.fromEntries(
    paths.map((path) => {
      const bytes = readFileSync(resolve(root, path));
      const pinned = execFileSync('git', ['show', `${input.modelRevision}:${path}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
      if (!bytes.equals(pinned)) throw new Error(`Model revision mismatch: ${path}`);
      return [path, sha256(bytes)];
    }),
  );
  execFileSync('python3', ['scripts/garrison_general_build.py', '--check'], { cwd: root, stdio: 'inherit' });
  const audit = await buildAudit(input);
  const output =
    JSON.stringify(
      {
        ...audit,
        fingerprints: {
          model: fingerprints,
          input: sha256(readFileSync(inputPath)),
          generator: sha256(readFileSync(resolve(root, 'scripts/garrison_audit.ts'))),
          schema: sha256(readFileSync(resolve(root, 'data/schemas/garrison-audit-input.json'))),
        },
      },
      null,
      2,
    ) + '\n';
  const path = resolve(root, 'data/reports/garrison-audit.json');
  if (check) {
    if (readFileSync(path, 'utf8') !== output) throw new Error('Garrison audit is stale; regenerate and review');
  } else writeFileSync(path, output);
  return audit.samples.length;
}

const scriptIndex = process.argv.findIndex((arg, index) => index > 0 && resolve(arg) === resolve('scripts/garrison_audit.ts'));
if (scriptIndex > 0) {
  const args = process.argv.slice(scriptIndex + 1);
  if (args.length > 1 || (args[0] !== undefined && args[0] !== '--check')) throw new Error('Usage: npx vite-node --script scripts/garrison_audit.ts [--check]');
  console.log(`Garrison audit: ${await runAudit(args[0] === '--check')} model samples; client verified: 0`);
}
