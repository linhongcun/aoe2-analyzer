import { readFileSync } from 'node:fs';
import type { Trees } from '../../src/domain/types';

export function treesWithoutBohemianHandCannoneer(): Trees {
  const trees = JSON.parse(readFileSync(new URL('../../data/game/trees.json', import.meta.url), 'utf8')) as Trees;
  const bohemians = trees.t.Bohemians;
  if (!bohemians) throw new Error('Missing Bohemians tree data');
  trees.t.Bohemians = bohemians.map((block) => [block[0], block[1], block[2], block[3].filter((cell) => !(cell[2] === 'u' && cell[3] === 5))]);
  return trees;
}
