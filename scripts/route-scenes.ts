/** #652 可复算两阶段账本；不是跨时代排名。 */
import { loadCore, loadTrees } from '../src/data';
import { ageRoutes, DEFAULT_ROUTE } from '../src/domain/ageRoutes';
import { routeSources } from '../src/domain/routeProfiles';
const ctx = { core: await loadCore(), trees: await loadTrees() };
console.log(
  JSON.stringify(
    {
      version: routeSources(),
      config: DEFAULT_ROUTE,
      lanes: Object.fromEntries(
        (['flank', 'pocket'] as const).map((lane) => [
          lane,
          ageRoutes(ctx, lane, DEFAULT_ROUTE).map((row) =>
            row.ok
              ? {
                  civ: row.civ,
                  feudalCount: row.feudalLedger.count,
                  feudal: row.feudal.stats,
                  feudalCost: row.feudal.cost,
                  feudalCycle: row.feudal.cycle,
                  survivors: row.survivors,
                  upgraded: row.upgraded,
                  retainedUnit: row.retained.unit.en,
                  retained: row.retained.stats,
                  newCount: row.newCount,
                  newUnit: row.castle.unit.en,
                  castleCost: row.castle.cost,
                  castleCycle: row.castle.cycle,
                  additional: row.castleLedger.spent,
                  cumulative: row.cumulative,
                  newSupport: row.newSupport,
                  signature: row.signature,
                }
              : row,
          ),
        ]),
      ),
    },
    null,
    2,
  ),
);
