/** Every game/content JSON has one explicit format; only like-shaped families share. */
export const SCHEMA_CATALOG = {
  ...Object.fromEntries(
    [
      'campaigns',
      'castle-defense',
      'contentCatalog',
      'game-guide',
      'events',
      'glossary',
      'hotkeys',
      'match-review',
      'mixed-army-rules',
      'mixed-army',
      'players',
      'scouting',
      'team-plan',
    ].map((name) => [`src/content/${name}.json`, `content-${name}.json`]),
  ),
  ...Object.fromEntries(
    [
      ['civs', 'civs'],
      ['units', 'units'],
      ['techs', 'techs'],
      ['buildings', 'buildings'],
      ['trees', 'trees'],
      ['effects', 'effects'],
      ['eco', 'eco'],
      ['construction', 'construction'],
      ['garrison', 'garrison'],
      ['garrison_general', 'garrison-general'],
      ['garrison_healing', 'garrison-healing'],
      ['garrison_techs', 'garrison-techs'],
      ['garrison_hosts', 'garrison-hosts'],
      ['market', 'market'],
      ['relic_income', 'relic-income'],
      ['trade_income', 'trade-income'],
      ['generate_resource', 'generate-resource'],
      ['catalog-introductions', 'catalog-introductions'],
      ['mapCatalog', 'map-catalog'],
      ['mapPreviews', 'map-previews'],
      ['search-py', 'search-py'],
      ['page-metadata', 'page-metadata'],
      ['team_bonuses', 'team-bonuses'],
    ].map(([file, schema]) => [`src/data/${file}.json`, `data-${schema}.json`]),
  ),
};

export function schemaFileFor(file) {
  if (Object.hasOwn(SCHEMA_CATALOG, file)) return SCHEMA_CATALOG[file];
  if (/^src\/data\/build-orders\/[a-z0-9-]+\.json$/u.test(file)) return 'data-build-order.json';
  if (/^src\/data\/patches\/[0-9]+\.json$/u.test(file)) return 'data-patch.json';
  return null;
}
