export interface EventEvidence {
  sourceId: string;
  locator: string;
}
export type EventFormat = '1v1' | '3v3-final';
export interface EventSource {
  id: string;
  title: string;
  url: string;
  kind: '官方赛事公告' | '主办方公告' | '主办方公布名单';
  sourcePublishedAt: string | null;
  publishedAt: string | null;
  checkedAt: string;
}
export type EventRole = { format: '1v1'; team: null; evidence: EventEvidence[] } | { format: '3v3-final'; team: string; evidence: EventEvidence[] };
export interface EventParticipant {
  playerId: string;
  roles: EventRole[];
}
export interface Event {
  id: string;
  title: string;
  game: '帝国时代 II：决定版';
  startDate: string;
  endDate: string;
  formats: EventFormat[];
  evidence: EventEvidence[];
  participants: EventParticipant[];
}
export interface EventCatalog {
  schemaVersion: 1;
  checkedAt: string;
  sources: EventSource[];
  events: Event[];
}
export type EventCatalogState = { status: 'ready' | 'empty'; catalog: EventCatalog } | { status: 'unavailable' };
export function eventCatalogProblems(value: unknown, knownPlayerIds: readonly string[]): { path: string; message: string }[];
export function readEventCatalog(value: unknown, knownPlayerIds: readonly string[]): EventCatalogState;
