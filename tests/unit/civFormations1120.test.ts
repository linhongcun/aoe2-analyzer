import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { approvedFormations, projectFormation } from '../../src/domain/civFormations';
import { validateDocument } from '../../scripts/content-schema.mjs';

const file = 'data/content/civ-formations.json';
const [spanish, georgians] = civFormationContent;
const [conquistador, paladin, handcannon] = spanish!.routes;
const tower = georgians!.routes[0]!;
const catalog = async () => ({ core: await loadCore(), trees: await loadTrees() });

describe('#1120 发布与阵容状态', () => {
  it('CLI 检查首批发布文件存在且恰好包含四条路线', () => {
    const root = mkdtempSync(join(tmpdir(), 'civ-formations-'));
    mkdirSync(join(root, 'data/content'), { recursive: true });
    const check = () => spawnSync(process.execPath, [resolve('scripts/check-content.mjs'), '--root', root, '--strict'], { encoding: 'utf8' });
    try {
      expect(check().stderr).toContain('缺少首批阵容发布文件');
      const partial = structuredClone(civFormationContent);
      partial[0]!.routes.pop();
      writeFileSync(join(root, file), JSON.stringify(partial));
      const rejected = check();
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain('首批路线集合');
      writeFileSync(join(root, file), JSON.stringify(civFormationContent));
      expect(check().status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('阻止额外路线、重复、草稿、未知依赖，保留合法的过期档案', () => {
    const check = (mutate: (data: typeof civFormationContent) => void) => {
      const data = structuredClone(civFormationContent);
      mutate(data);
      return validateDocument(file, data).valid;
    };
    expect(check((data) => data[0]!.routes.push({ ...conquistador!, id: 'fifth' }))).toBe(false);
    expect(check((data) => data[0]!.routes.push(conquistador!))).toBe(false);
    expect(
      check((data) => {
        data[0]!.routes[0]!.status = 'draft';
      }),
    ).toBe(false);
    expect(
      check((data) => {
        data[0]!.routes[0]!.adjustments[0]!.requires = [{ kind: 'unit', id: 9999 }];
      }),
    ).toBe(false);
    expect(
      check((data) => {
        data[0]!.routes[0]!.patch.build -= 1;
      }),
    ).toBe(true);
  });

  it('固定资料能解析四路及实体类型，空态和历史无需目录', async () => {
    const resources = await catalog();
    expect(approvedFormations(civFormationContent.find(({ civ }) => civ === 'Japanese'))).toEqual([]);
    expect(approvedFormations({ ...spanish!, routes: [{ ...conquistador!, status: 'draft' }] })).toEqual([]);
    expect(projectFormation({ ...tower, patch: { ...tower.patch, build: tower.patch.build - 1 } }, 'Georgians', DATA_PATCH).status).toBe('historical');
    expect(resources.trees.t.Georgians?.some(([id]) => id === 235)).toBe(false);
    expect(
      civFormationContent.flatMap(({ civ, routes }) =>
        routes.map((route) => {
          const view = projectFormation(route, civ, DATA_PATCH, resources, routes);
          expect(view.status).toBe('current');
          if (view.status !== 'current') throw new Error(route.id);
          expect(view.supplements.every(Boolean)).toBe(true);
          expect(view.adjustments.some((adjustment) => adjustment.unavailable)).toBe(false);
          return view.required.map(({ kind, entity }) => [kind, entity.id, entity.zh, entity.age]);
        }),
      ),
    ).toEqual([
      [
        ['unit', 773, '精锐西班牙征服者', 4],
        ['unit', 441, '翼骑兵', 4],
      ],
      [
        ['unit', 569, '游侠', 4],
        ['unit', 6, '精锐掷矛手', 3],
      ],
      [
        ['unit', 5, '火枪手', 4],
        ['unit', 359, '长戟兵', 4],
      ],
      [
        ['unit', 1805, '精锐莫纳斯帕', 4],
        ['building', 235, '大型箭塔', 4],
        ['tech', 923, '斯万箭塔', 3],
      ],
    ]);
  });

  it.each([63, 923])('单独禁用科技 %i 使箭塔路线不可用', async (id) => {
    const { core, trees } = await catalog();
    const copy = structuredClone(trees);
    const cell = copy.t.Georgians?.flatMap((block) => block[3]).find((cell) => cell[2] === 't' && cell[3] === id);
    expect(cell?.[4]).toBe(1);
    cell![4] = 0;
    expect(projectFormation(tower, 'Georgians', DATA_PATCH, { core, trees: copy }).status).toBe('unavailable');
  });

  it('局部屏蔽缺少辅助项或目标路线的确定建议，保留独立说明', async () => {
    const { core, trees } = await catalog();
    const unitById = { ...core.unitById };
    delete unitById[36];
    delete unitById[5];
    const partial = { core: { ...core, unitById }, trees };
    expect(projectFormation(handcannon!, 'Spanish', DATA_PATCH, partial).status).toBe('unavailable');
    unitById[5] = core.unitById[5]!;
    const artillery = projectFormation(handcannon!, 'Spanish', DATA_PATCH, partial);
    expect(artillery.status === 'current' && artillery.adjustments.slice(-2)).toEqual([
      expect.objectContaining({ id: 'anti-siege', unavailable: true, text: undefined }),
      expect.objectContaining({ id: 'break-defenses', text: expect.stringContaining('巨型投石机') }),
    ]);
    delete unitById[5];
    const cavalry = projectFormation(paladin!, 'Spanish', DATA_PATCH, partial, spanish!.routes);
    expect(cavalry.status === 'current' && cavalry.adjustments[0]).toMatchObject({ text: '避开正面接战。', unavailable: true });
    expect(projectFormation(conquistador!, 'Spanish', DATA_PATCH, partial).status).toBe('current');
  });
});
