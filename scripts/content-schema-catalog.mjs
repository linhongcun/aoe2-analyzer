/** Scanned game/content JSON and the explicit reference contract have one format each. */
export const SCHEMA_CATALOG = {
  'data/content/civ-formations.json': 'content-civ-formations.json',
  'data/reference/civ-formations-contract.json': 'content-civ-formations-contract.json',
  'data/content/civ-updates.json': 'content-civ-updates.json',
  'data/content/civs/history.json': 'content-civ-history.json',
  ...Object.fromEntries(
    [
      'campaigns',
      'castle-defense',
      'contentCatalog',
      'game-guide',
      'glossary',
      'hotkeys',
      'match-review',
      'mixed-army-rules',
      'mixed-army',
      'scouting',
      'team-plan',
    ].map((name) => [`data/content/${name}.json`, `content-${name}.json`]),
  ),
  ...Object.fromEntries(
    [
      ['civs', 'civs'],
      ['units', 'units'],
      ['techs', 'techs'],
      ['buildings', 'buildings'],
      ['trees', 'trees'],
      ['effects', 'effects'],
      ['siege', 'siege'],
      ['eco', 'eco'],
      ['army_research', 'army-research'],
      ['army_cost_usage', 'army-cost-usage'],
      ['sim_research_prices', 'sim-research-prices'],
      ['construction', 'construction'],
      ['garrison', 'garrison'],
      ['garrison_general', 'garrison-general'],
      ['garrison_healing', 'garrison-healing'],
      ['garrison_techs', 'garrison-techs'],
      ['garrison_hosts', 'garrison-hosts'],
      ['market', 'market'],
      ['relic_income', 'relic-income'],
      ['charge_attack', 'charge-attack'],
      ['trade_income', 'trade-income'],
      ['generate_resource', 'generate-resource'],
      ['catalog-introductions', 'catalog-introductions'],
      ['mapCatalog', 'map-catalog'],
      ['mapPreviews', 'map-previews'],
      ['search-py', 'search-py'],
      ['page-metadata', 'page-metadata'],
      ['team_bonuses', 'team-bonuses'],
      ['ladder-beginner', 'ladder-beginner'],
    ].map(([file, schema]) => [`data/game/${file}.json`, `data-${schema}.json`]),
  ),
};

export function schemaFileFor(file) {
  if (Object.hasOwn(SCHEMA_CATALOG, file)) return SCHEMA_CATALOG[file];
  if (/^data\/game\/build-orders\/[a-z0-9-]+\.json$/u.test(file)) return 'data-build-order.json';
  if (/^data\/game\/patches\/[0-9]+\.json$/u.test(file)) return 'data-patch.json';
  if (/^data\/game\/ladder-arabia-[a-z0-9.-]+\.json$/u.test(file)) return 'data-ladder-arabia.json';
  if (/^data\/game\/ladder-4v4-[a-z0-9.-]+\.json$/u.test(file)) return 'data-ladder-4v4.json';
  return null;
}
