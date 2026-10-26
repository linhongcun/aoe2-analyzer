import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import construction from '../../src/data/construction.json';
import healing from '../../src/data/garrison_healing.json';
import scouting from '../../src/content/scouting.json';
import pageMetadata from '../../src/data/page-metadata.json';
import teamBonuses from '../../src/data/team_bonuses.json';

const modules = [
  '../../src/data/construction.json',
  '../../src/data/garrison_healing.json',
  '../../src/content/scouting.json',
  '../../src/data/page-metadata.json',
  '../../src/data/team_bonuses.json',
];
afterEach(() => {
  modules.forEach((path) => vi.doUnmock(path));
  vi.resetModules();
});

describe('#285 JSON 必须先校验再成为可信数据', () => {
  it('独立 Node ESM 与浏览器转换均可加载同一份 standalone 代码', () => {
    const source = `
      import { readFileSync } from 'node:fs';
      const inputs = [['construction','src/data/construction.json'],['garrison-healing','src/data/garrison_healing.json'],['scouting','src/content/scouting.json'],['page-metadata','src/data/page-metadata.json'],['team-bonuses','src/data/team_bonuses.json']];
      for (const [name, path] of inputs) {
        const { default: validate } = await import('./src/content/schema/compiled/' + name + '.mjs');
        if (!validate(JSON.parse(readFileSync(path, 'utf8')))) throw new Error(name + ' standalone failed');
      }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('施工的共享字典索引超出范围时在展开前拒绝', async () => {
    const bad = structuredClone(construction);
    bad.civs.Franks.units = 999;
    vi.doMock('../../src/data/construction.json', () => ({ default: bad }));
    await expect(import('../../src/data/construction')).rejects.toThrow(/数据.*校验/);
  });

  it('驻军回血不接受把建筑 ID 列表写成字符串', async () => {
    vi.doMock('../../src/data/garrison_healing.json', () => ({ default: { ...healing, hostIds: ['109'] } }));
    await expect(import('../../src/domain/garrisonHealing')).rejects.toThrow(/数据.*校验/);
  });

  it('侦察来源 URL 必须是外部公开链接', async () => {
    const bad = structuredClone(scouting);
    bad.sources[0]!.url = 'file:///scripts/private-source.csv';
    vi.doMock('../../src/content/scouting.json', () => ({ default: bad }));
    await expect(import('../../src/domain/scouting')).rejects.toThrow(/数据.*校验/);
  });

  it('分享元信息不能把标题当数字接收', async () => {
    vi.doMock('../../src/data/page-metadata.json', () => ({ default: { ...pageMetadata, '/': { title: 123, description: '说明' } } }));
    await expect(import('../../src/domain/sharePage')).rejects.toThrow(/数据.*校验/);
  });

  it('团队来源必须拒绝未登记的内部字段', async () => {
    vi.doMock('../../src/data/team_bonuses.json', () => ({ default: { ...teamBonuses, privateCsv: 'internal.csv' } }));
    await expect(import('../../src/domain/teamBonuses')).rejects.toThrow(/数据.*校验/);
  });
});
