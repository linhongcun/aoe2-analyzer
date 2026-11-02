/** issue 652 可复现小型场景快照；不写回产品数据。 */
import { loadCore, loadTrees } from '../src/data';
import { DEFAULT_FLANK_SCENE, DEFAULT_SCENE, scenarioRows, scenarioVersion } from '../src/domain/positionScenarios';
const context = { core: await loadCore(), trees: await loadTrees() };
const scenarios = [
  { id: 'flank-default', lane: 'flank' as const, cfg: DEFAULT_FLANK_SCENE },
  { id: 'flank-slow', lane: 'flank' as const, cfg: { ...DEFAULT_FLANK_SCENE, reaction: 1.25 } },
  { id: 'flank-close', lane: 'flank' as const, cfg: { ...DEFAULT_FLANK_SCENE, distance: 2 } },
  { id: 'pocket-default', lane: 'pocket' as const, cfg: DEFAULT_SCENE },
  { id: 'pocket-short', lane: 'pocket' as const, cfg: { ...DEFAULT_SCENE, distance: 10 } },
  { id: 'pocket-long', lane: 'pocket' as const, cfg: { ...DEFAULT_SCENE, distance: 10, deadline: 1200 } },
];
console.log(
  JSON.stringify(
    {
      version: scenarioVersion(),
      scenarios: scenarios.map(({ id, lane, cfg }) => ({
        id,
        config: cfg,
        rows: scenarioRows(context, lane, cfg).map((r) => ({
          civ: r.civ,
          status: r.status,
          preferred: r.preferred,
          count: r.count,
          opening: r.opening,
          support: r.support,
          signature: r.signature,
        })),
      })),
    },
    null,
    2,
  ),
);
