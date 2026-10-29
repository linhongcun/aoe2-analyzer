import validateEvents from '../content/schema/compiled/events.mjs';
import { isCalendarDate, sourceBeijingDate } from './playerCatalog.mjs';

/** The same complete structure and reference checks protect Node and browsers. */
export function eventCatalogProblems(value, knownPlayerIds) {
  if (!validateEvents(value)) {
    return (validateEvents.errors ?? []).map((error) => ({ path: error.instancePath, message: error.message ?? '赛事目录结构无效' }));
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
  const checkEvidence = (evidence, path) => {
    for (const [index, entry] of evidence.entries()) {
      if (!sourceIds.has(entry.sourceId)) add(`${path}/${index}/sourceId`, '事实引用了未登记来源');
    }
  };
  const eventIds = new Set();
  const players = new Set(knownPlayerIds);
  for (const [index, event] of value.events.entries()) {
    const path = `/events/${index}`;
    if (eventIds.has(event.id)) add(`${path}/id`, '赛事 ID 重复');
    eventIds.add(event.id);
    if (!isCalendarDate(event.startDate)) add(`${path}/startDate`, '开始日期不是有效日历日期');
    if (!isCalendarDate(event.endDate)) add(`${path}/endDate`, '结束日期不是有效日历日期');
    if (event.endDate < event.startDate) add(`${path}/endDate`, '结束日期不能早于开始日期');
    checkEvidence(event.evidence, `${path}/evidence`);
    const participantIds = new Set();
    for (const [participantIndex, participant] of event.participants.entries()) {
      const participantPath = `${path}/participants/${participantIndex}`;
      if (participantIds.has(participant.playerId)) add(`${participantPath}/playerId`, '同一赛事的选手引用重复');
      participantIds.add(participant.playerId);
      if (!players.has(participant.playerId)) add(`${participantPath}/playerId`, '参赛选手不在已验证选手目录中');
      const formats = new Set();
      for (const [roleIndex, role] of participant.roles.entries()) {
        const rolePath = `${participantPath}/roles/${roleIndex}`;
        if (formats.has(role.format)) add(`${rolePath}/format`, '选手公布角色重复');
        formats.add(role.format);
        if (!event.formats.includes(role.format)) add(`${rolePath}/format`, '选手角色不属于赛事公布赛制');
        checkEvidence(role.evidence, `${rolePath}/evidence`);
      }
    }
  }
  return problems;
}

/** Invalid inputs never throw at import, create default cards, or publish a subset. */
export function readEventCatalog(value, knownPlayerIds) {
  try {
    if (eventCatalogProblems(value, knownPlayerIds).length) return { status: 'unavailable' };
    return { status: value.events.length ? 'ready' : 'empty', catalog: value };
  } catch {
    return { status: 'unavailable' };
  }
}
