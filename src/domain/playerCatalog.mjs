import validatePlayers from '../content/schema/compiled/players.mjs';

/** Calendar checks run before Date conversion, which otherwise normalizes Feb 30. */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Full source instant to its public date in Beijing, without inferring a match date. */
export function sourceBeijingDate(value) {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!parts || !isCalendarDate(parts[1]) || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59) return null;
  if (parts[5] !== 'Z' && (Number(parts[7]) > 23 || Number(parts[8]) > 59)) return null;
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return null;
  return new Date(instant + 8 * 3600_000).toISOString().slice(0, 10);
}

/** The same structure/date/reference checks protect both browsers and Node scripts. */
export function playerCatalogProblems(value, civIds) {
  if (!validatePlayers(value)) {
    return (validatePlayers.errors ?? []).map((error) => ({ path: error.instancePath, message: error.message ?? '选手目录结构无效' }));
  }
  const problems = [];
  const add = (path, message) => problems.push({ path, message });
  if (!isCalendarDate(value.checkedAt)) add('/checkedAt', '核对日期不是有效日历日期');
  const sourceIds = new Set();
  for (const [index, source] of value.sources.entries()) {
    const path = `/sources/${index}`;
    if (sourceIds.has(source.id)) add(`${path}/id`, '来源 ID 重复');
    sourceIds.add(source.id);
    if (!isCalendarDate(source.checkedAt) || source.checkedAt > value.checkedAt) add(`${path}/checkedAt`, '来源核对日期无效或晚于目录核对日期');
    if ((source.sourcePublishedAt === null) !== (source.publishedAt === null)) add(`${path}/publishedAt`, '公开时间戳与发布日期必须同时已知或同时为空');
    if (source.sourcePublishedAt !== null) {
      const published = sourceBeijingDate(source.sourcePublishedAt);
      if (published === null || !isCalendarDate(source.publishedAt) || published !== source.publishedAt) {
        add(`${path}/publishedAt`, '发布日期必须是有效来源时间戳换算的北京时间日期');
      } else if (published > source.checkedAt) add(`${path}/publishedAt`, '来源公开日期不能晚于核对日期');
    }
  }
  const playerIds = new Set();
  for (const [index, player] of value.players.entries()) {
    if (playerIds.has(player.id)) add(`/players/${index}/id`, '选手 ID 重复');
    playerIds.add(player.id);
  }
  const civs = new Set(civIds);
  const checkedYear = Number(value.checkedAt.slice(0, 4));
  for (const [index, player] of value.players.entries()) {
    const path = `/players/${index}`;
    for (const [field, evidence] of [
      ['identityEvidence', player.identityEvidence],
      ['achievement/evidence', player.achievement.evidence],
      ['match/evidence', player.match.evidence],
    ]) {
      for (const [evidenceIndex, entry] of evidence.entries()) {
        if (!sourceIds.has(entry.sourceId)) add(`${path}/${field}/${evidenceIndex}/sourceId`, '事实引用了未登记来源');
      }
    }
    for (const field of ['achievement', 'match']) {
      if (player[field].year > checkedYear) add(`${path}/${field}/year`, '年度事实不能晚于目录核对年份');
    }
    for (const field of ['civId', 'opponentCivId']) {
      if (!civs.has(player.match[field])) add(`${path}/match/${field}`, '对局文明不在当前文明目录中');
    }
    if (!playerIds.has(player.match.opponentId) || player.match.opponentId === player.id) add(`${path}/match/opponentId`, '对手必须是目录中的另一位选手');
  }
  return problems;
}

/** Never throw at module import or publish the valid subset of an invalid catalog. */
export function readPlayerCatalog(value, civIds) {
  try {
    if (playerCatalogProblems(value, civIds).length) return { status: 'unavailable' };
    return { status: value.players.length ? 'ready' : 'empty', catalog: value };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Exact, case-sensitive catalog membership; unknown IDs have no default player. */
export function playerById(catalog, id) {
  return typeof id === 'string' ? catalog.players.find((player) => player.id === id) : undefined;
}

export function playerPath(player) {
  return `/players/${player.id}`;
}

export function playerRoutes(catalog) {
  return catalog.players.map(playerPath);
}
