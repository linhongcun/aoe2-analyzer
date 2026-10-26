import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDocument } from '../../scripts/content-schema.mjs';

type Mutation = { file: string; path: (string | number)[]; value: unknown };
const load = (file: string): unknown => JSON.parse(readFileSync(`src/data/${file}.json`, 'utf8'));
function rewrite(data: unknown, path: readonly (string | number)[], value: unknown): unknown {
  const copy: unknown = structuredClone(data);
  let target = copy;
  for (const key of path.slice(0, -1)) {
    if (!target || typeof target !== 'object') throw new Error(`Missing fixture path: ${path.join('.')}`);
    target = (target as Record<string, unknown>)[key];
  }
  const last = path.at(-1);
  if (last === undefined || !target || typeof target !== 'object') throw new Error('Missing mutation target');
  (target as Record<string, unknown>)[last] = value;
  return copy;
}
const validate = (file: string, data: unknown) => validateDocument(`src/data/${file}.json`, data);

// Changes exercise the producer's closed unions, compact tuples, raw dataclasses,
// and dictionary values. Every fixture passes before its one-field mutation.
const structureMutations: Mutation[] = [
  { file: 'civs', path: [0, 's'], value: [5] },
  { file: 'units', path: [0, 'arms'], value: [['Cavalry', 1, 'extra']] },
  { file: 'techs', path: [0, 'pre'], value: '22' },
  { file: 'buildings', path: [0, 'cost', 'Wood'], value: -1 },
  { file: 'trees', path: ['t', 'Armenians', 0, 3, 0], value: [1, 0, 'u', 74, 1, null, 7] },
  { file: 'effects', path: ['techs', 'Yeomen', 'rules', 0, 'fx', 0], value: { s: 'bonus', v: 2 } },
  { file: 'eco', path: ['civEco', 'Armenians', 0, 'effects', 0, 'kind'], value: 'attr' },
  { file: 'garrison', path: ['units', '109', 'capacity'], value: '15' },
  { file: 'garrison_general', path: ['civs', 'Khmer', 'baseOverrides', '70', 'resourceCapacity'], value: '0' },
  { file: 'garrison_techs', path: ['techs', '10'], value: 1 },
  { file: 'garrison_hosts', path: [0], value: 109.5 },
  { file: 'market', path: ['engine', 'rounding'], value: 'ceil' },
  { file: 'relic_income', path: ['audit', 'monasteries', '1806', 'tasks', 0, 'work_value_1'], value: '1' },
  { file: 'trade_income', path: ['units', '128', 'population'], value: 0 },
  { file: 'generate_resource', path: ['modifiers', 0, 'op'], value: 'add' },
  { file: 'catalog-introductions', path: ['techs', '3'], value: 'release-1' },
  { file: 'mapCatalog', path: ['maps', 0, 'preview', 'sourceUrl'], value: 'file:///cache/map.webp' },
  { file: 'mapPreviews', path: ['arabia', 'width'], value: 0 },
  { file: 'search-py', path: ['CA：骑射手', 'py'], value: '123' },
  { file: 'build-orders/hybrid-fish-18', path: ['steps', 0, 'actions'], value: [{ type: 'train', unit: '83' }] },
  { file: 'patches/185872', path: ['entries', 0, 'source'], value: '/internal/patch-notes' },
];

describe('#285 生成数据保留各领域的精确结构', () => {
  it.each(structureMutations)('$file 拒绝损坏的深层字段', ({ file, path, value }) => {
    const original = load(file);
    expect(validate(file, original).valid).toBe(true);
    expect(validate(file, rewrite(original, path, value)).valid).toBe(false);
  });

  it('空的 relic 审计分支仍有结构定义，未知 task 字段不能溜过', () => {
    const file = 'relic_income';
    const original = load(file);
    expect(validate(file, rewrite(original, ['audit', 'gaiaRelics', '285'], null)).valid).toBe(true);
    expect(validate(file, rewrite(original, ['audit', 'monasteries', '1806', 'tasks', 0, 'newRawField'], 1)).valid).toBe(false);
    expect(validate(file, rewrite(original, ['audit', 'resourceTaskReferences'], [[1, 2, 3, {}]])).valid).toBe(false);
  });

  it('Khmer 的合法资源容量 override 保留，其他任意 override 字段被拒绝', () => {
    const file = 'garrison_general';
    const original = load(file);
    expect(validate(file, rewrite(original, ['civs', 'Khmer', 'baseOverrides', '70', 'resourceCapacity'], 0)).valid).toBe(true);
    expect(validate(file, rewrite(original, ['civs', 'Khmer', 'baseOverrides', '70', 'privateOverride'], 1)).valid).toBe(false);
  });

  it('经济时代前置要求不能接收未定义的递归节点', () => {
    const file = 'eco';
    expect(validate(file, rewrite(load(file), ['ageReq', '2', 'req'], { n: 1, of: [{ privateRequirement: 12 }] })).valid).toBe(false);
  });
});

const sourceMutations: Mutation[] = [
  { file: 'garrison', path: ['meta', 'patch'], value: 'SHA256: internal digest' },
  { file: 'relic_income', path: ['meta', 'patch'], value: 'CSV row 1' },
  { file: 'patches/81058', path: ['entries', 0, 'relatedTargets', 0, 'relation'], value: 'commit abcdef12' },
  { file: 'market', path: ['engine', 'sources', 0, 'scope'], value: '由 CSV 行计算' },
  { file: 'patches/185872', path: ['entries', 0, 'originalText'], value: 'commit abcdef12' },
  { file: 'patches/185872', path: ['entries', 0, 'scopeNote'], value: '参见 scripts/history_build.py' },
  { file: 'build-orders/hybrid-fish-18', path: ['sources', 0, 'ref'], value: 'owner/repository@abcdef12' },
  { file: 'build-orders/hybrid-fish-18', path: ['sources', 0, 'section'], value: 'src/content/build-orders/example.yaml' },
  { file: 'build-orders/hybrid-fish-18', path: ['license'], value: '提交 abcdef12 转写' },
];
describe('#285 生成数据的可见来源与内部 provenance 分开校验', () => {
  it('真实费用把文明加成作为玩家来源，不能把内部定位写进 bon', async () => {
    const original = load('civs') as { en: string; bon: string[] }[];
    const index = original.findIndex((civ) => civ.en === 'Celts');
    const { gatherModel } = await import('../../src/domain/realCost');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(gatherModel(2, 'Celts').applied.some((line) => line.source === original[index]?.bon[0])).toBe(true);
    const bad = rewrite(original, [index, 'bon', 0], 'SHA256: internal CSV row');
    const result = validate('civs', bad);
    expect(result.valid).toBe(false);
    expect(result.problems.some((problem) => problem.path === `/${index}/bon/0` && problem.params?.format === 'source-text')).toBe(true);
  });

  it.each(sourceMutations)('$file 的可见来源拒绝内部文案', ({ file, path, value }) => {
    expect(validate(file, rewrite(load(file), path, value)).valid).toBe(false);
  });

  it('公开固定版本 URL 与内部生成记录可保留哈希', () => {
    const file = 'relic_income';
    const pinned = 'https://github.com/SiegeEngineers/genieutils-py/blob/0123456789abcdef0123456789abcdef01234567/resources.py';
    expect(validate(file, rewrite(load(file), ['meta', 'fieldSemantics', 'resources'], pinned)).valid).toBe(true);
    expect(validate(file, rewrite(load(file), ['meta', 'datSource', 'commit'], '0123456789abcdef0123456789abcdef01234567')).valid).toBe(true);
  });
});
