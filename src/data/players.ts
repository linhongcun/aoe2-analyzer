import raw from '../content/players.json';
import civs from './raw/civs';
import { readPlayerCatalog } from '../domain/playerCatalog.mjs';
export { playerById, playerPath } from '../domain/playerCatalog.mjs';

/** Raw JSON is untrusted; broken structure or references become an explicit UI state. */
export const PLAYER_CATALOG = readPlayerCatalog(
  raw,
  civs.map((civ) => civ.en),
);
