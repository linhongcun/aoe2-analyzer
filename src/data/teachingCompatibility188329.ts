import type sources from '../../scripts/data_sources.json';

/** A one-patch review of two unchanged catalogues, never a migration of saved plans.
 * Exact original bytes are SHA-256 checked in teachingCompatibility486.test.ts.
 * The small runtime fingerprint also refuses accidental content edits; it is not a security hash.
 */
export const TEACHING_COMPATIBILITY_188329 = {
  originalPatch: 185872,
  approvedPatch: 188329,
  reviewedAt: '2026-10-29',
  baselineCommit: '7f3521c2',
  evidence: 'docs/design/teaching-compatibility-486.md',
  // Baseline teaching facts remain unchanged; eco additionally records the source-only metadata audit below.
  audit: {
    units: '416854add45339048fc7aa19a6b76efa275a62d140f45dbc6f6345cb4ca295b4',
    techs: '2e9c7e21d5e2fd1bfa1a4eb6b1556a6541da359d64ef2ba4cb301233a2743a1e',
    buildings: '9b6b290d946512cdd421c8f7c616d601930d3f3c0bb46eb37087c8e08697e902',
    trees: '27cd18f2a436899f1e3ab1a31996482a9d073a8b1c698670b78466d67b50a9f8',
    eco: 'f7f1b308ab8933ac614afdc74ea201f1952e7d9356f6d3ce194229507f89d29d',
    effects: 'a78d80cc8d68ecf589b07679c46d78d51aad5d4c17664d8be30422e93d0bfc64',
    garrison: '3e652ce07e4d8a03371b9f7b8b3f01af72ddcb30ed9a5a918d2665fafd452178',
    exampleCivs: '39ad0bd93202b3c71e1ad78e7e4fe304e6f1d5b3fcaa704eac01132db301b92a',
    routes: 'a5dadef9227a892eeb39148d5df07e3ff108209ce17ef4e7309a8733d3419a71',
  },
  sourceMetadataAudit: {
    currentBase: '6b9cc7eb3ddef630888145cdedd8be73f7deaf0e',
    originalEcoProjection: 'e62ff60130ddfd6cc17eb1b3723ccda4549bddc9ec7dc31880f70008c7014368',
    currentEcoProjection: 'af5eeb7121d8c4126c5d16624fdd22d4cda86f228119342062af327547a026bf',
    addedMetadata: {
      '/civEco/Jurchens/0/jurchenTech': '504b1809290ce81bc751108477e92a4aecea02414223d077fd34df5e1af896f3',
      '/civEco/Jurchens/1/jurchenTech': 'd8fca530655e29215f319de23bea6337b02b35c64cf59de3b3b55d80178fb62e',
    },
    evidence: 'docs/design/jurchens197-teaching-metadata.json',
  },
  subsequentSourceMetadataAudits: [
    {
      baseCommit: '7844d93fe646b91b0eeec9c6ff867e6c25929c62',
      previousEcoProjection: 'af5eeb7121d8c4126c5d16624fdd22d4cda86f228119342062af327547a026bf',
      currentEcoProjection: 'f7f1b308ab8933ac614afdc74ea201f1952e7d9356f6d3ce194229507f89d29d',
      evidence: 'docs/design/chinese197-teaching-metadata.json',
    },
  ],
  content: {
    'game-guide': {
      path: 'src/content/game-guide.json',
      sha256: '0fb5169eb64fcbf3ebd45a589936509892fca343426180d36f090fa7d94d6335',
      fingerprint: '99826f42',
    },
    'team-plan': {
      path: 'src/content/team-plan.json',
      sha256: '21f4384b9c5bca40fcb0892d26b418557eb6798ed5b249f5d3ba8c6a3e4cdec7',
      fingerprint: 'fc03a0be',
    },
  },
  sources: {
    dat: {
      repo: 'SiegeEngineers/auto-mods',
      commit: 'e293dc106b0f3b0ceac2db98409fbcc5c921190b',
      path: 'dat/empires2_x2_p1.dat',
      sha256: 'd0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f',
    },
    aoe2techtree: {
      repo: 'SiegeEngineers/aoe2techtree',
      commit: 'e56728e76b7d08301fba7b18d5f16bc8554c109a',
      path: 'data/',
    },
    halfon: {
      repo: 'SiegeEngineers/halfon',
      commit: '7f96c37fc5f63c7141ec7d88e91c627beb375b28',
      path: 'data/units_buildings_techs.de.json',
    },
  },
} as const;

type TeachingCatalog = keyof typeof TEACHING_COMPATIBILITY_188329.content;
export function reviewedTeachingContent188329(catalog: TeachingCatalog, content: unknown, pins: typeof sources): boolean {
  const review = TEACHING_COMPATIBILITY_188329;
  if (pins.patch.build !== review.approvedPatch) return false;
  for (const name of ['dat', 'aoe2techtree', 'halfon'] as const) {
    const expected = review.sources[name];
    const actual = pins.sources[name];
    if (actual.repo !== expected.repo || actual.commit !== expected.commit || actual.path !== expected.path) return false;
  }
  if (pins.sources.dat.sha256 !== review.sources.dat.sha256) return false;
  const text = JSON.stringify(content);
  if (text === undefined) return false;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0') === review.content[catalog].fingerprint;
}
