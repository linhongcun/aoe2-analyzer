import raw from '../content/events.json';
import { readEventCatalog } from '../domain/eventCatalog.mjs';
import type { EventCatalogState } from '../domain/eventCatalog.mjs';
import { PLAYER_CATALOG } from './players';

/** Profile membership comes only from the successfully validated player catalog. */
export const EVENT_CATALOG: EventCatalogState =
  PLAYER_CATALOG.status === 'unavailable'
    ? { status: 'unavailable' }
    : readEventCatalog(
        raw,
        PLAYER_CATALOG.catalog.players.map((player) => player.id),
      );
