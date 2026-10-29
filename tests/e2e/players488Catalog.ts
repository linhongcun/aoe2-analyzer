import { readFileSync } from 'node:fs';
import { readPlayerCatalog } from '../../src/domain/playerCatalog.mjs';

// Playwright runs in Node ESM, so read JSON through fs and use the same browser/Node validator.
const civs: { en: string }[] = JSON.parse(readFileSync(new URL('../../src/data/civs.json', import.meta.url), 'utf8'));
export const PLAYER_CATALOG = readPlayerCatalog(
  JSON.parse(readFileSync(new URL('../../src/content/players.json', import.meta.url), 'utf8')),
  civs.map((civ) => civ.en),
);
