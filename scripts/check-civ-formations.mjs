import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFormationSource } from '../src/domain/civFormationsSource.mjs';
import { isAgeProgressionSupplement, partitionableSupplementIndices } from '../src/domain/formationPartition.mjs';

export const FORMATIONS_FILE = 'data/content/civ-formations.json';
export const FORMATION_CONTRACT_FILE = 'data/reference/civ-formations-contract.json';
const FIXED_SOURCE_COMMIT = '8d1adeacc7c97374ee6d95d9cabfceb793d080d3';
const GAME_DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../data/game');

let cachedCatalogIds;
function getDefaultCatalogIds() {
  if (!cachedCatalogIds) {
    const readIds = (file) => new Set(JSON.parse(readFileSync(resolve(GAME_DATA_DIR, file), 'utf8')).map(({ id }) => id));
    cachedCatalogIds = {
      unit: readIds('units.json'),
      building: readIds('buildings.json'),
      tech: readIds('techs.json'),
    };
  }
  return cachedCatalogIds;
}
const threeKingdoms = new Set(['Wei', 'Shu', 'Wu']);
const PINNED_STRATEGY_URL_RE = /^https:\/\/github\.com\/linhongcun\/aoe2-analyzer\/blob\/([0-9a-f]{40})\/role\/game-strategy\.md#L([1-9]\d*)-L([1-9]\d*)$/;
const isStrictlyAscendingLines = (lines) =>
  Array.isArray(lines) && lines.length > 0 && lines.every((n, idx) => Number.isInteger(n) && n > 0 && (idx === 0 || n > lines[idx - 1]));

const sameArray = (actual = [], expected = []) =>
  actual.length === expected.length && actual.every((value, index) => JSON.stringify(value) === JSON.stringify(expected[index]));
const ref = ({ kind, id, age }) => ({ kind, id, ...(age === undefined ? {} : { age }) });
const entityRefs = (values = []) =>
  values.map((entity) => ({
    ...ref(entity),
    ...(entity.research ? { research: entity.research.tech } : {}),
    ...(entity.research?.trainingPrice ? { trainingPrice: true } : {}),
  }));
const routeDependency = ({ kind, id, age }) => (kind === 'route' ? { kind, id } : { kind, id, ...(age === undefined ? {} : { age }) });

const normalizeGate = (gate) => {
  if (!gate) return undefined;
  switch (gate.kind) {
    case 'supplement':
      return { kind: 'supplement', index: gate.index, ...(gate.requireFull ? { requireFull: true } : {}) };
    case 'adjustment':
      return { kind: 'adjustment', id: gate.id };
    case 'conditionBranch':
      return { kind: 'conditionBranch', id: gate.id };
    case 'entity':
      return { kind: 'entity', entityKind: gate.entityKind, id: gate.id, ...(gate.age === undefined ? {} : { age: gate.age }) };
    default:
      return gate;
  }
};

const normalizeScenario = (scenario) => ({
  id: scenario.id,
  ...(scenario.group ? { group: scenario.group } : {}),
  ...(scenario.actionHintGate ? { actionHintGate: normalizeGate(scenario.actionHintGate) } : {}),
  ...(scenario.summaryGate ? { summaryGate: normalizeGate(scenario.summaryGate) } : {}),
  ...(scenario.omitSupplementConditions
    ? {
        omitSupplementConditions: scenario.omitSupplementConditions.map(({ supplementIndex, coveredBy }) => ({
          supplementIndex,
          coveredBy: { kind: coveredBy.kind, id: coveredBy.id },
        })),
      }
    : {}),
  ...(scenario.caveats?.length ? { caveatGates: scenario.caveats.map((item) => (item.whenAvailable ? normalizeGate(item.whenAvailable) : null)) } : {}),
  ...(scenario.links?.length
    ? {
        links: scenario.links.map((item) => ({
          index: item.index,
          ...(item.whenAvailable ? { whenAvailable: normalizeGate(item.whenAvailable) } : {}),
        })),
      }
    : {}),
  ...(scenario.supplementIndices ? { supplementIndices: [...scenario.supplementIndices] } : {}),
  ...(scenario.adjustmentIds ? { adjustmentIds: [...scenario.adjustmentIds] } : {}),
  ...(scenario.conditionBranchIds ? { conditionBranchIds: [...scenario.conditionBranchIds] } : {}),
});

function validateCatalogRef(entityKind, id, path, catalogIds, add) {
  if (!['unit', 'building', 'tech'].includes(entityKind) || !Number.isInteger(id) || id < 1) {
    add(path, '门控实体引用无效');
  } else if (catalogIds && !catalogIds[entityKind]?.has(id)) {
    add(path, `门控引用了目录中不存在的实体：${entityKind}#${id}`);
  }
}

function validateGate(gate, gatePath, route, adjIds, branchIds, catalogIds, add) {
  if (!gate || typeof gate !== 'object') return;
  if (gate.kind === 'supplement') {
    const sups = route.supplements ?? [];
    if (!Number.isInteger(gate.index) || gate.index < 0 || gate.index >= sups.length) {
      add(gatePath, `门控引用了越界补充下标：${gate.index}`);
    } else if (isAgeProgressionSupplement(route, sups[gate.index])) {
      add(gatePath, `门控不能引用 age-progression 阶段延续补充：${gate.index}`);
    }
  } else if (gate.kind === 'adjustment') {
    if (!adjIds.has(gate.id)) add(gatePath, `门控引用了未知调整：${gate.id}`);
  } else if (gate.kind === 'conditionBranch') {
    if (!branchIds.has(gate.id)) add(gatePath, `门控引用了未知条件分支：${gate.id}`);
  } else if (gate.kind === 'entity') {
    validateCatalogRef(gate.entityKind, gate.id, gatePath, catalogIds, add);
  } else {
    add(gatePath, `未知门控类型：${String(gate.kind)}`);
  }
}

function validateRouteScenarios(route, contractRoute, routePath, catalogIds, add) {
  if (route.scenarios === undefined) {
    if (contractRoute.scenarios !== undefined) add(`${routePath}/scenarios`, '局面配置缺失，与独立发布契约不一致');
    return;
  }
  if (!Array.isArray(route.scenarios)) {
    add(`${routePath}/scenarios`, 'scenarios 必须为数组');
    return;
  }
  const sups = route.supplements ?? [];
  const partitionableSups = partitionableSupplementIndices(route);
  const partitionableSet = new Set(partitionableSups);
  const adjIds = new Set((route.adjustments ?? []).map(({ id }) => id));
  const branchIds = new Set((route.conditionBranches ?? []).map(({ id }) => id));
  const linkCount = route.evidence?.links?.length ?? 0;

  if (route.scenarios.length === 0) {
    if (partitionableSups.length > 0 || adjIds.size > 0 || branchIds.size > 0) {
      add(`${routePath}/scenarios`, '空 scenarios 仅允许零可分区源项路线');
    }
  }

  const seenScenarioIds = new Set();
  const seenSups = new Set();
  const seenAdjs = new Set();
  const seenBranches = new Set();

  for (const [k, scenario] of route.scenarios.entries()) {
    const scPath = `${routePath}/scenarios/${k}`;
    if (seenScenarioIds.has(scenario.id)) add(`${scPath}/id`, `局面 ID 重复：${scenario.id}`);
    seenScenarioIds.add(scenario.id);

    const hasRefs =
      (scenario.supplementIndices?.length ?? 0) > 0 || (scenario.adjustmentIds?.length ?? 0) > 0 || (scenario.conditionBranchIds?.length ?? 0) > 0;
    if (!hasRefs) add(scPath, '每个局面必须至少引用一条补充、调整或条件分支');

    const scSupSet = new Set();
    for (const idx of scenario.supplementIndices ?? []) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= sups.length) {
        add(`${scPath}/supplementIndices`, `补充下标越界：${idx}`);
      } else if (!partitionableSet.has(idx)) {
        add(`${scPath}/supplementIndices`, `age-progression 阶段延续补充不得纳入 scenarios：${idx}`);
      } else if (scSupSet.has(idx) || seenSups.has(idx)) {
        add(`${scPath}/supplementIndices`, `补充下标重复引用：${idx}`);
      } else {
        scSupSet.add(idx);
        seenSups.add(idx);
      }
    }

    const scAdjSet = new Set();
    for (const id of scenario.adjustmentIds ?? []) {
      if (!adjIds.has(id)) add(`${scPath}/adjustmentIds`, `未知调整 ID：${id}`);
      else if (scAdjSet.has(id) || seenAdjs.has(id)) add(`${scPath}/adjustmentIds`, `调整 ID 重复引用：${id}`);
      else {
        scAdjSet.add(id);
        seenAdjs.add(id);
      }
    }

    const scBranchSet = new Set();
    for (const id of scenario.conditionBranchIds ?? []) {
      if (!branchIds.has(id)) add(`${scPath}/conditionBranchIds`, `未知条件分支 ID：${id}`);
      else if (scBranchSet.has(id) || seenBranches.has(id)) add(`${scPath}/conditionBranchIds`, `条件分支 ID 重复引用：${id}`);
      else {
        scBranchSet.add(id);
        seenBranches.add(id);
      }
    }

    const seenOmitSups = new Set();
    for (const [m, item] of (scenario.omitSupplementConditions ?? []).entries()) {
      const omitPath = `${scPath}/omitSupplementConditions/${m}`;
      if (!scSupSet.has(item.supplementIndex)) {
        add(omitPath, `omitSupplementConditions 引用了非本局面补充下标：${item.supplementIndex}`);
      } else if (seenOmitSups.has(item.supplementIndex)) {
        add(omitPath, `omitSupplementConditions 重复声明补充下标：${item.supplementIndex}`);
      } else {
        seenOmitSups.add(item.supplementIndex);
      }
      if (item.coveredBy?.kind === 'adjustment') {
        if (!scAdjSet.has(item.coveredBy.id)) add(omitPath, `coveredBy 引用的调整不在本局面内：${item.coveredBy.id}`);
      } else if (item.coveredBy?.kind === 'conditionBranch') {
        if (!scBranchSet.has(item.coveredBy.id)) add(omitPath, `coveredBy 引用的条件分支不在本局面内：${item.coveredBy.id}`);
      } else {
        add(omitPath, 'coveredBy 类型无效');
      }
    }

    if (scenario.actionHintGate) validateGate(scenario.actionHintGate, `${scPath}/actionHintGate`, route, adjIds, branchIds, catalogIds, add);
    if (scenario.summaryGate) validateGate(scenario.summaryGate, `${scPath}/summaryGate`, route, adjIds, branchIds, catalogIds, add);
    for (const [m, caveat] of (scenario.caveats ?? []).entries()) {
      if (caveat.whenAvailable) validateGate(caveat.whenAvailable, `${scPath}/caveats/${m}/whenAvailable`, route, adjIds, branchIds, catalogIds, add);
    }

    if (scenario.links?.length) {
      if (linkCount === 0) add(`${scPath}/links`, '路线未配置 evidence.links，不能引用链接下标');
      const seenLinkIdx = new Set();
      for (const [m, linkRef] of scenario.links.entries()) {
        if (!Number.isInteger(linkRef.index) || linkRef.index < 0 || linkRef.index >= linkCount) {
          add(`${scPath}/links/${m}`, `核对链接下标越界：${linkRef.index}`);
        } else if (seenLinkIdx.has(linkRef.index)) {
          add(`${scPath}/links/${m}`, `同局面重复引用核对链接下标：${linkRef.index}`);
        } else {
          seenLinkIdx.add(linkRef.index);
        }
        if (linkRef.whenAvailable) validateGate(linkRef.whenAvailable, `${scPath}/links/${m}/whenAvailable`, route, adjIds, branchIds, catalogIds, add);
      }
    }

    if (route.scenarios.length >= 6 && scenario.group !== 'opponent' && scenario.group !== 'condition') {
      add(`${scPath}/group`, '局面数达到 6 项及以上时必须显式标注 group');
    }
  }

  for (const idx of partitionableSups) {
    if (!seenSups.has(idx)) add(`${routePath}/scenarios`, `可分区补充未被任何局面引用：${idx}`);
  }
  for (const id of adjIds) {
    if (!seenAdjs.has(id)) add(`${routePath}/scenarios`, `调整未被任何局面引用：${id}`);
  }
  for (const id of branchIds) {
    if (!seenBranches.has(id)) add(`${routePath}/scenarios`, `条件分支未被任何局面引用：${id}`);
  }

  const normalized = route.scenarios.map(normalizeScenario);
  if (!Array.isArray(contractRoute.scenarios) || !sameArray(normalized, contractRoute.scenarios)) {
    add(`${routePath}/scenarios`, '局面分区或门控与独立发布契约不一致');
  }
}

export function formationProblems(content, contract, catalogIds = getDefaultCatalogIds()) {
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
      if (new Set(adjustments.map(({ id }) => id)).size !== adjustments.length) add(`${routePath}/adjustments`, '调整 ID 重复');
      if (!sameArray(adjustments, contractRoute.adjustments)) add(`${routePath}/adjustments`, '调整或依赖与独立发布契约不一致');
      const conditionBranches = (route.conditionBranches ?? []).map(({ id, requires, displayRequires }) => ({
        id,
        requires: requires.map(ref),
        ...(displayRequires ? { displayRequires: displayRequires.map(ref) } : {}),
      }));
      if (new Set(conditionBranches.map(({ id }) => id)).size !== conditionBranches.length) add(`${routePath}/conditionBranches`, '条件分支 ID 重复');
      if (!sameArray(conditionBranches, contractRoute.conditionBranches)) add(`${routePath}/conditionBranches`, '条件分支或依赖与独立发布契约不一致');
      for (const [bIdx, branch] of (route.conditionBranches ?? []).entries()) {
        for (const [rIdx, dep] of (branch.displayRequires ?? []).entries()) {
          validateCatalogRef(dep.kind, dep.id, `${routePath}/conditionBranches/${bIdx}/displayRequires/${rIdx}`, catalogIds, add);
        }
      }
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
      const actualLinkRequires = (route.evidence?.links ?? []).flatMap((link, index) => (link.requires ? [{ index, requires: link.requires.map(ref) }] : []));
      for (const [lIdx, link] of (route.evidence?.links ?? []).entries()) {
        for (const [rIdx, dep] of (link.requires ?? []).entries()) {
          validateCatalogRef(dep.kind, dep.id, `${routePath}/evidence/links/${lIdx}/requires/${rIdx}`, catalogIds, add);
        }
      }
      if (
        Boolean(actualLinkRequires.length) !== Boolean(contractRoute.evidenceLinkRequires?.length) ||
        !sameArray(actualLinkRequires, contractRoute.evidenceLinkRequires ?? [])
      )
        add(`${routePath}/evidence/links`, '核对链接依赖与独立发布契约不一致');
      validateRouteScenarios(route, contractRoute, routePath, catalogIds, add);
      if (threeKingdoms.has(civ.civ)) {
        const lines = contractRoute.sourceLines;
        const match = typeof source?.content === 'string' ? PINNED_STRATEGY_URL_RE.exec(source.content) : null;
        if (!isStrictlyAscendingLines(lines) || !match || Number(match[2]) !== lines[0] || Number(match[3]) !== lines.at(-1))
          add(`${routePath}/source/content`, '魏蜀吴来源行必须对应固定策略提交及严格递增起止行范围');
      } else if (typeof source?.content === 'string' && /\/role\/game-strategy\.md#L\d+-L\d+$/.test(source.content)) {
        const lines = contractRoute.sourceLines;
        const match = PINNED_STRATEGY_URL_RE.exec(source.content);
        if (!isStrictlyAscendingLines(lines) || !match || Number(match[2]) > Number(match[3]))
          add(`${routePath}/source/content`, '带起止行号的策略来源必须固定 40 位提交哈希且行号严格递增');
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
