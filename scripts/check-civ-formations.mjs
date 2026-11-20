import { resolveFormationSource } from '../src/domain/civFormationsSource.mjs';

export const FORMATIONS_FILE = 'data/content/civ-formations.json';
export const FORMATION_CONTRACT_FILE = 'data/reference/civ-formations-contract.json';
const FIXED_SOURCE_COMMIT = '8d1adeacc7c97374ee6d95d9cabfceb793d080d3';
const THREE_KINGDOMS_SOURCE_COMMIT = 'a348c548624a41da50735eebf166d23456ff56fa';
const threeKingdoms = new Set(['Wei', 'Shu', 'Wu']);

const sameArray = (actual = [], expected = []) =>
  actual.length === expected.length && actual.every((value, index) => JSON.stringify(value) === JSON.stringify(expected[index]));
const ref = ({ kind, id, age }) => ({ kind, id, ...(age === undefined ? {} : { age }) });
const entityRefs = (values = []) => values.map(ref);
const routeDependency = ({ kind, id, age }) => (kind === 'route' ? { kind, id } : { kind, id, ...(age === undefined ? {} : { age }) });

export function formationProblems(content, contract) {
  const problems = [];
  const add = (path, message) => problems.push({ path, message });
  if (!Array.isArray(content) || !contract || !Array.isArray(contract.civs)) {
    add('', '阵容内容或独立发布契约缺失');
    return problems;
  }
  if (contract.fixedSourceCommit !== FIXED_SOURCE_COMMIT) add('/fixedSourceCommit', '契约未固定到已审定的策略来源提交');
  const civIds = content.map((entry) => entry.civ);
  const contractCivs = contract.civs.map((entry) => entry.civ);
  if (new Set(civIds).size !== civIds.length) add('', '文明重复');
  if (new Set(contractCivs).size !== contractCivs.length) add('/civs', '契约文明重复');
  if (!sameArray([...civIds].sort(), [...contractCivs].sort())) add('', '文明集合与独立发布契约不一致');
  const expectedByCiv = new Map(contract.civs.map((entry) => [entry.civ, entry]));
  for (const [i, civ] of content.entries()) {
    const expectedCiv = expectedByCiv.get(civ.civ);
    if (!expectedCiv) continue;
    const path = `/${i}`;
    const ids = civ.routes.map(({ id }) => id);
    const expectedIds = expectedCiv.routes.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) add(`${path}/routes`, '路线 ID 重复');
    if (!sameArray([...ids].sort(), [...expectedIds].sort())) add(`${path}/routes`, '路线集合与独立发布契约不一致');
    if (civ.routeGroups) {
      const grouped = civ.routeGroups.flatMap((group) => group.routes.map(({ id }) => id));
      const published = civ.routes.filter(({ status }) => status !== 'draft').map(({ id }) => id);
      if (!sameArray(grouped.sort(), published.sort())) add(`${path}/routeGroups`, '分组必须为每条发布路线指定唯一入口');
    }
    const routeById = new Map(civ.routes.map((route) => [route.id, route]));
    for (const [j, route] of civ.routes.entries()) {
      const contractRoute = expectedCiv.routes.find((item) => item.id === route.id);
      if (!contractRoute) continue;
      const routePath = `${path}/routes/${j}`;
      for (const key of ['status', 'playtest', 'composition', 'presentation', 'age']) {
        if (route[key] !== contractRoute[key]) add(`${routePath}/${key}`, `与独立发布契约不一致：${key}`);
      }
      if (!sameArray(entityRefs(route.required), contractRoute.required)) add(`${routePath}/required`, '必需实体或时代与独立发布契约不一致');
      const choices = (route.choices ?? []).map(({ id, preconditions, entities }) => ({
        id,
        preconditions,
        entities: entityRefs(entities),
      }));
      if (!sameArray(choices, contractRoute.choices)) add(`${routePath}/choices`, '路线选择与独立发布契约不一致');
      if (route.choiceLabel !== contractRoute.choiceLabel) add(`${routePath}/choiceLabel`, '选择组标题与独立发布契约不一致');
      if (!sameArray(entityRefs(route.prerequisites), contractRoute.prerequisites)) add(`${routePath}/prerequisites`, '路线前置或时代与独立发布契约不一致');
      const supplements = (route.supplements ?? []).map(({ mode, entities, requires }) => ({
        mode,
        ...(requires ? { requires: entityRefs(requires) } : {}),
        entities: entityRefs(entities),
      }));
      if (!sameArray(supplements, contractRoute.supplements)) add(`${routePath}/supplements`, '补充/选择分类与独立发布契约不一致');
      const adjustments = (route.adjustments ?? []).map(({ id, requires = [] }) => ({
        id,
        requires: requires.map(routeDependency),
      }));
      if (!sameArray(adjustments, contractRoute.adjustments)) add(`${routePath}/adjustments`, '调整或依赖与独立发布契约不一致');
      const source = resolveFormationSource(civ.source, route);
      if (!source || source.content !== contractRoute.source.content || source.discussion !== contractRoute.source.discussion)
        add(`${routePath}/source`, '有效来源与独立发布契约不一致');
      if (!sameArray(route.evidence?.sourceLines ?? [], contractRoute.sourceLines))
        add(`${routePath}/evidence/sourceLines`, '固定策略来源行与独立发布契约不一致');
      if (
        !sameArray(
          route.evidence?.links?.map(({ href }) => href),
          contractRoute.evidenceLinks,
        )
      )
        add(`${routePath}/evidence/links`, '核对链接与独立发布契约不一致');
      if (threeKingdoms.has(civ.civ)) {
        const lines = contractRoute.sourceLines;
        const pinned = `https://github.com/linhongcun/aoe2-analyzer/blob/${THREE_KINGDOMS_SOURCE_COMMIT}/role/game-strategy.md#L${lines[0]}-L${lines.at(-1)}`;
        if (!lines.length || source?.content !== pinned) add(`${routePath}/source/content`, '魏蜀吴来源行必须对应本单固定策略版本');
      }
      if (route.composition === 'choice' && (route.choices ?? []).length < 2) add(`${routePath}/choices`, '择一路线至少需要两个可审查选项');
      for (const adjustment of route.adjustments ?? []) {
        for (const dependency of adjustment.requires ?? []) {
          if (dependency.kind !== 'route') continue;
          const target = routeById.get(dependency.id);
          if (!target) add(`${routePath}/adjustments`, `未知或跨文明路线依赖：${dependency.id}`);
          else if (['draft', 'unverified'].includes(target.status)) add(`${routePath}/adjustments`, `依赖不能指向草稿或依据待核实路线：${dependency.id}`);
        }
      }
    }
  }
  return problems;
}
