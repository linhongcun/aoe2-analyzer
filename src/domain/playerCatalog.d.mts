export interface PlayerEvidence {
  sourceId: string;
  locator: string;
}
export interface PlayerSource {
  id: string;
  title: string;
  url: string;
  kind: string;
  sourcePublishedAt: string | null;
  publishedAt: string | null;
  checkedAt: string;
}
export interface Player {
  id: string;
  handle: string;
  fullName: string;
  country: string;
  identityEvidence: PlayerEvidence[];
  achievement: {
    year: number;
    event: string;
    result: '冠军';
    evidence: PlayerEvidence[];
  };
  match: {
    year: number;
    event: string;
    stage: '决赛';
    game: string;
    map: string | null;
    civId: string;
    opponentId: string;
    opponentCivId: string;
    evidence: PlayerEvidence[];
  };
}
export interface PlayerCatalog {
  checkedAt: string;
  sources: PlayerSource[];
  players: Player[];
}
export type PlayerCatalogState = { status: 'ready' | 'empty'; catalog: PlayerCatalog } | { status: 'unavailable' };
export function isCalendarDate(value: unknown): value is string;
export function sourceBeijingDate(value: unknown): string | null;
export function playerCatalogProblems(value: unknown, civIds: readonly string[]): { path: string; message: string }[];
export function readPlayerCatalog(value: unknown, civIds: readonly string[]): PlayerCatalogState;
export function playerById(catalog: PlayerCatalog, id: unknown): Player | undefined;
export function playerPath(player: Player): string;
export function playerRoutes(catalog: PlayerCatalog): string[];
