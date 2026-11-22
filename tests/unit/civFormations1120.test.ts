import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { approvedFormations, projectFormation } from '../../src/domain/civFormations';
import { formationProblems, FORMATION_CONTRACT_FILE } from '../../scripts/check-civ-formations.mjs';

const [spanish, georgians] = civFormationContent;
const [conquistador, paladin, handcannon] = spanish!.routes;
const tower = georgians!.routes[0]!;
const contract = JSON.parse(readFileSync(resolve(FORMATION_CONTRACT_FILE), 'utf8'));
const catalog = async () => ({ core: await loadCore(), trees: await loadTrees() });

describe('#1120 与 #1139 发布契约', () => {
  it('严格 CLI 要求契约与阵容文件齐全、可解析且结构一致', () => {
    const root = mkdtempSync(join(tmpdir(), 'civ-formations-'));
    const write = (content = civFormationContent, includeContract = true, contractData: unknown = contract) => {
      mkdirSync(join(root, 'data/content'), { recursive: true });
      mkdirSync(join(root, 'data/reference'), { recursive: true });
      writeFileSync(join(root, 'data/content/civ-formations.json'), JSON.stringify(content));
      if (includeContract) writeFileSync(join(root, FORMATION_CONTRACT_FILE), JSON.stringify(contractData));
    };
    const check = () => spawnSync(process.execPath, [resolve('scripts/check-content.mjs'), '--root', root, '--strict'], { encoding: 'utf8' });
    try {
      write(civFormationContent, false);
      expect(check().stderr).toContain('缺少文明阵容独立发布契约');
      write();
      writeFileSync(join(root, FORMATION_CONTRACT_FILE), '{');
      expect(check().stderr).toContain('JSON 语法无效');
      write(civFormationContent, true, { ...contract, schemaVersion: 2 });
      expect(check().stderr).toContain('schema');
      const partial = structuredClone(civFormationContent);
      partial[0]!.routes.pop();
      write(partial);
      expect(check().stderr).toContain('路线集合与独立发布契约不一致');
      write(civFormationContent);
      expect(check().status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('静态契约阻止重复/缺失路线、错误状态时代、错链和错误依赖', () => {
    const check = (mutate: (data: typeof civFormationContent) => void) => {
      const data = structuredClone(civFormationContent);
      mutate(data);
      return formationProblems(data, contract).length === 0;
    };
    expect(check((data) => data[0]!.routes.push({ ...data[0]!.routes[0]!, id: 'extra' }))).toBe(false);
    expect(check((data) => data[0]!.routes.push(data[0]!.routes[0]!))).toBe(false);
    expect(
      check((data) => {
        data[0]!.routes[0]!.status = 'candidate';
      }),
    ).toBe(false);
    expect(
      check((data) => {
        data[0]!.routes[0]!.age = 3;
      }),
    ).toBe(false);
    expect(
      check((data) => {
        data[0]!.source.content = data[1]!.source.content;
      }),
    ).toBe(false);
    expect(
      check((data) => {
        data[0]!.routes[1]!.adjustments![0]!.requires = [{ kind: 'route', id: 'unknown' }];
      }),
    ).toBe(false);
    expect(
      check((data) => {
        data[0]!.routes[0]!.patch.build -= 1;
      }),
    ).toBe(true);
  });

  it('精确保留西班牙三路与格鲁吉亚一路的身份、条件、组成和来源', () => {
    expect([spanish!.civ, georgians!.civ]).toEqual(['Spanish', 'Georgians']);
    expect(spanish!.routes.map((route) => [route.id, route.title, route.condition])).toEqual([
      ['conquistador-hussar', '精锐西班牙征服者＋翼骑兵', '已有或能维持城堡金线，能操作机动部队，并有安全接敌路径。'],
      ['paladin-skirmisher', '游侠＋精锐掷矛手', '已有骑兵路线，或能承担升级和补兵，且地形与接敌适合骑兵。'],
      ['handcannon-halberdier', '火枪手＋长戟兵', '步兵或反骑压力与现有投入使这条路线适合，且能保护较慢的推进。'],
    ]);
    expect(georgians!.routes.map((route) => [route.id, route.title, route.condition])).toEqual([
      ['monaspa-towers', '精锐莫纳斯帕＋箭塔', '能控制并保护施工位置，有石料与村民投入。不在暴露地点强行前置。'],
    ]);
    for (const civ of [spanish!, georgians!]) {
      expect(
        civ.routes.every((route) => route.status === 'approved' && route.playtest === 'unreported' && route.age === 4 && route.composition === 'combined'),
      ).toBe(true);
      expect(civ.routes.every((route) => route.source === undefined)).toBe(true);
    }
    expect(spanish!.routes.map((route) => route.required.map(({ kind, id }) => `${kind}:${id}`))).toEqual([
      ['unit:773', 'unit:441'],
      ['unit:569', 'unit:6'],
      ['unit:5', 'unit:359'],
    ]);
    expect(georgians!.routes[0]!.required.map(({ kind, id }) => `${kind}:${id}`)).toEqual(['unit:1805', 'building:235', 'tech:923']);
    expect(georgians!.routes[0]!.prerequisites.map(({ kind, id, historicalName }) => [kind, id, historicalName])).toEqual([['tech', 63, '大型箭塔']]);
    expect(spanish!.source).toEqual({
      content: 'https://github.com/linhongcun/aoe2-analyzer/blob/9eded5cf510deda603558b37920431f9491b75b3/role/game-strategy.md#西班牙',
      discussion: 'https://app.devin.ai/sessions/0324fdbe099145518bae6f421b8925c4',
      boundary: '未验证混编胜负，不把单兵克制当作阵容效果。',
    });
    expect(georgians!.source).toEqual({
      content: 'https://github.com/linhongcun/aoe2-analyzer/blob/9eded5cf510deda603558b37920431f9491b75b3/role/game-strategy.md#格鲁吉亚',
      discussion: 'https://app.devin.ai/sessions/0324fdbe099145518bae6f421b8925c4',
      boundary: '穿透目标数与逐个伤害未核实，驻军箭数为站内理论预览、未与客户端逐项对账，不扩写为范围溅射或混编输出。',
    });
  });

  it('目录解析精确保留旧四路，Celts 仍为空态，旧补丁保留历史状态', async () => {
    const resources = await catalog();
    expect(approvedFormations(civFormationContent.find(({ civ }) => civ === 'Celts'))).toEqual([]);
    expect(approvedFormations({ ...spanish!, routes: [{ ...conquistador!, status: 'draft' }] })).toEqual([]);
    expect(projectFormation({ ...tower, patch: { ...tower.patch, build: tower.patch.build - 1 } }, 'Georgians', DATA_PATCH).status).toBe('historical');
    expect(resources.trees.t.Georgians?.some(([id]) => id === 235)).toBe(false);
    const projected = civFormationContent
      .slice(0, 2)
      .flatMap(({ civ, routes, source }) => routes.map((item) => projectFormation(item, civ, DATA_PATCH, resources, routes, source)));
    expect(projected.every((view) => view.status === 'current')).toBe(true);
    expect(
      projected.map((view) => {
        if (view.status !== 'current') throw new Error(view.status);
        expect(view.supplements.every(Boolean)).toBe(true);
        expect(view.adjustments.some(({ unavailable }) => unavailable)).toBe(false);
        return view.required.map(({ kind, entity }) => [kind, entity.id, entity.zh, entity.age]);
      }),
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

  it.each([63, 923])('禁用科技 %i 后旧格鲁吉亚阵容不可用', async (id) => {
    const { core, trees } = await catalog();
    const copy = structuredClone(trees);
    const cell = copy.t.Georgians?.flatMap((block) => block[3]).find((entry) => entry[2] === 't' && entry[3] === id);
    expect(cell?.[4]).toBe(1);
    cell![4] = 0;
    expect(projectFormation(tower, 'Georgians', DATA_PATCH, { core, trees: copy }, georgians!.routes, georgians!.source).status).toBe('unavailable');
  });

  it('必需项失效整卡不可用，可选调整只局部隐藏', async () => {
    const { core, trees } = await catalog();
    const unitById = { ...core.unitById };
    delete unitById[36];
    delete unitById[5];
    const partial = { core: { ...core, unitById }, trees };
    expect(projectFormation(handcannon!, 'Spanish', DATA_PATCH, partial).status).toBe('unavailable');
    unitById[5] = core.unitById[5]!;
    const artillery = projectFormation(handcannon!, 'Spanish', DATA_PATCH, partial);
    expect(artillery.status === 'current' && artillery.adjustments.slice(-2)).toEqual([
      expect.objectContaining({ id: 'anti-siege', unavailable: true }),
      expect.objectContaining({ id: 'break-defenses', text: expect.stringContaining('巨型投石机') }),
    ]);
    delete unitById[5];
    const cavalry = projectFormation(paladin!, 'Spanish', DATA_PATCH, partial, spanish!.routes);
    expect(cavalry.status === 'current' && cavalry.adjustments[0]).toMatchObject({ text: '避开正面接战。', unavailable: true });
    expect(projectFormation(conquistador!, 'Spanish', DATA_PATCH, partial).status).toBe('current');
  });
});
