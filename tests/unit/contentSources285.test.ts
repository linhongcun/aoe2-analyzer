import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDocument } from '../../scripts/content-schema.mjs';

const directory = 'src/content/';
const contentNames = [
  'campaigns',
  'castle-defense',
  'contentCatalog',
  'game-guide',
  'glossary',
  'hotkeys',
  'match-review',
  'mixed-army-rules',
  'mixed-army',
  'scouting',
  'team-plan',
];

/** Every mutation starts from the full real document, preserving unrelated fields. */
function rewrite(name: string, path: readonly (string | number)[], value: unknown): unknown {
  const data: unknown = JSON.parse(readFileSync(`${directory}${name}.json`, 'utf8'));
  let target = data;
  for (const key of path.slice(0, -1)) {
    if (!target || typeof target !== 'object') throw new Error(`Unknown fixture path: ${path.join('.')}`);
    target = (target as Record<string, unknown>)[key];
  }
  const key = path.at(-1);
  if (key === undefined || !target || typeof target !== 'object') throw new Error('Missing mutation target');
  (target as Record<string, unknown>)[key] = value;
  return data;
}

describe('#285 可见来源与隐藏证据具有明确边界', () => {
  it.each(contentNames)('%s 的固定结构不允许附加任意内部字段', (name) => {
    const bad = rewrite(name, name === 'glossary' ? [0, 'privateCsv'] : ['privateCsv'], 'unreviewed');
    expect(validateDocument(`${directory}${name}.json`, bad).valid).toBe(false);
  });

  it.each([
    { name: 'campaigns', path: ['sources', 'fe-campaigns', 'title'], value: 'SHA256: internal digest' },
    { name: 'castle-defense', path: ['sources', 0, 'scope'], value: 'main @ 075ead2' },
    { name: 'contentCatalog', path: ['products', 0, 'sources', 0, 'note'], value: '参见 src/data/units.json' },
    { name: 'game-guide', path: ['sources', 'official-start', 'version'], value: 'repo @ abcdef12' },
    { name: 'glossary', path: [0, 'sources', 0, 'title'], value: 'CSV 行号记录' },
    { name: 'hotkeys', path: ['sources', 0, 'note'], value: '来自 scripts/keys.py' },
    { name: 'match-review', path: ['sources', 0, 'note'], value: '0123456789abcdef'.repeat(4) },
    { name: 'mixed-army', path: ['sources', 0, 'note'], value: 'commit 0123456789abcdef' },
    { name: 'scouting', path: ['sources', 0, 'note'], value: '提交号 0123456789abcdef0123456789abcdef01234567' },
    { name: 'team-plan', path: ['sources', 0, 'claim'], value: '依据 tests/unit/example.test.ts' },
  ])('$name 实际可见来源字段拒绝内部用语', ({ name, path, value }) => {
    expect(validateDocument(`${directory}${name}.json`, rewrite(name, path, value)).valid).toBe(false);
  });

  it('战役内部版本、校验值和逐字段证据不会被误当成公开文案', () => {
    const name = 'campaigns';
    const hiddenVersion = rewrite(name, ['sources', 'client-en', 'version'], 'main @ abcdef12; hidden audit provenance');
    expect(validateDocument(`${directory}${name}.json`, hiddenVersion).valid).toBe(true);
    const hiddenLocator = rewrite(name, ['campaigns', 0, 'fieldEvidence', 'civilizationIds', 'locator'], 'guide CSV row 1');
    expect(validateDocument(`${directory}${name}.json`, hiddenLocator).valid).toBe(true);
    const hiddenDigest = rewrite(name, ['sources', 'client-en', 'sha256'], '0123456789abcdef'.repeat(4));
    expect(validateDocument(`${directory}${name}.json`, hiddenDigest).valid).toBe(true);
  });

  it('无外部链接的 editorial 元数据可保留，外部战役来源仍必须有公开链接', () => {
    const data = JSON.parse(readFileSync(`${directory}campaigns.json`, 'utf8'));
    expect(validateDocument(`${directory}campaigns.json`, data).valid).toBe(true);
    delete data.sources['fe-campaigns'].url;
    expect(validateDocument(`${directory}campaigns.json`, data).valid).toBe(false);
  });

  it('链接字段拒绝非 HTTP(S) 来源，同时允许公开的固定版本链接', () => {
    const path = ['sources', 'fe-campaigns', 'url'];
    for (const value of ['file:///cache/campaigns.json', 'javascript:alert(1)', '/internal/source.json']) {
      expect(validateDocument(`${directory}campaigns.json`, rewrite('campaigns', path, value)).valid).toBe(false);
    }
    const pinned = 'https://github.com/example/catalog/blob/0123456789abcdef0123456789abcdef01234567/data.json';
    expect(validateDocument(`${directory}campaigns.json`, rewrite('campaigns', path, pinned)).valid).toBe(true);
  });

  it('混兵执行元数据只接受已实现的策略与字段', () => {
    expect(validateDocument(`${directory}mixed-army-rules.json`, rewrite('mixed-army-rules', ['cards', 0, 'strategy'], 'automatic-best-army')).valid).toBe(
      false,
    );
    expect(validateDocument(`${directory}mixed-army-rules.json`, rewrite('mixed-army-rules', ['cards', 0, 'privateCsv'], 'internal')).valid).toBe(false);
  });
});
