/** Public citations are a projection; raw pins and original licenses stay intact. */
const guideUrl = /^https:\/\/aoe2guide\.com\/en\/builds\/([a-z0-9-]+)\/$/u;
const guidePath = /^src\/content\/build-orders\/([a-z0-9-]+)\.yaml$/u;
const guideRef = /^themkdemiiir\/aoe2-guide@([0-9a-f]{7,40})$/u;
const licensePin = /（MIT License，© 2026 Mehmet Kaan Demir，提交 ([0-9a-f]{7,40})）/u;
const techVersion = /^main ([0-9a-f]{7,40}) \/ (DE[0-9]+)$/u;
const techSnapshot = /^https:\/\/github\.com\/linhongcun\/aoe2-analyzer\/blob\/([0-9a-f]{40})\/src\/data\/techs\.json$/u;

function guidePin(source) {
  const url = guideUrl.exec(source.url ?? '');
  const path = guidePath.exec(source.section ?? '');
  const ref = guideRef.exec(source.ref ?? '');
  return url && path && ref && url[1] === path[1] ? ref[1] : null;
}

export function publicBuildSources(sources) {
  return (sources ?? [])
    .filter((source) => typeof source?.title === 'string' && source.title.trim() !== '')
    .map((source) => {
      if (!guidePin(source)) return { ...source };
      const citation = { ...source };
      delete citation.section;
      delete citation.ref;
      return citation;
    });
}

export function publicBuildLicense(license, sources) {
  const match = licensePin.exec(license);
  if (!match || licensePin.test(license.slice(match.index + match[0].length)) || !(sources ?? []).some((source) => guidePin(source) === match[1]))
    return license;
  return license.replace(match[0], '（MIT License，© 2026 Mehmet Kaan Demir）');
}

export function publicBuildPresentation(order) {
  return { sources: publicBuildSources(order.sources), license: publicBuildLicense(order.license, order.sources) };
}

export function publicGameGuideSources(sources) {
  return Object.fromEntries(
    Object.entries(sources).map(([id, source]) => {
      const version = techVersion.exec(source.version);
      const snapshot = techSnapshot.exec(source.url);
      const publicVersion = id === 'pinned-techs' && version && snapshot && snapshot[1].startsWith(version[1]) ? version[2] : source.version;
      return [id, { ...source, version: publicVersion }];
    }),
  );
}
