import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { freeGarrisonTechs } from '../../src/domain/garrisonTechs';
import { getFreeGarrisonTechs, GENERAL_GARRISON_DATA } from '../../src/domain/garrisonGeneral';

it('#282 preserves the free-technology matrix for all civilizations, ages, buildings and technology states', async () => {
  const ctx = { core: await loadCore(), trees: await loadTrees() };
  const hash = createHash('sha256');
  const states = [[], [140, 63, 64], ctx.core.techs.map((tech) => tech.id)];
  for (const civ of Object.keys(GENERAL_GARRISON_DATA.civs).sort())
    for (const age of [1, 2, 3, 4])
      for (const building of ctx.core.buildings)
        for (const techs of states) {
          const config = { civ, age, techs, rows: [] };
          const result = getFreeGarrisonTechs(ctx, building, config);
          expect(freeGarrisonTechs(ctx, building, config), `${civ}/${age}/${building.id}`).toEqual(result);
          hash.update(JSON.stringify([civ, age, building.id, result]) + '\n');
        }
  expect(hash.digest('hex')).toBe('a3dbcca9d19c4d4ad5223aa4185ba56acc3a02681e078fc0f59a0d4a4f7ee9c0');
}, 15_000);
