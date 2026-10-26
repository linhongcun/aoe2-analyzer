/* global URL */
/** Pure, shared policy: public citations are distinct from internal provenance. */
export function isPublicSourceUrl(value) {
  if (
    typeof value !== 'string' ||
    !/^https?:\/\/[^/?#\\]/iu.test(value) ||
    value.includes('\\') ||
    [...value].some((character) => character.charCodeAt(0) <= 0x20 || character.charCodeAt(0) === 0x7f)
  )
    return false;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/u, '');
    if (host.startsWith('[')) {
      const address = host.slice(1, -1);
      const first = Number.parseInt(address.split(':')[0], 16);
      const second = Number.parseInt(address.split(':')[1] || '0', 16);
      return first >= 0x2000 && first <= 0x3fff && !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) && !(first === 0x3fff && second <= 0xfff);
    }
    if (/^\d+\.\d+\.\d+\.\d+$/u.test(host)) {
      const [a, b, c] = host.split('.').map(Number);
      return !(
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
        (a === 192 && b === 88 && c === 99) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113)
      );
    }
    const labels = host.split('.');
    if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) return false;
    if (/^\d+$/u.test(labels.at(-1))) return false;
    if (['local', 'localhost', 'internal', 'test', 'invalid', 'example', 'home', 'lan', 'corp', 'onion'].includes(labels.at(-1))) return false;
    return true;
  } catch {
    return false;
  }
}

// Versions such as DE185872 and dates are not commit hashes. Public URL pins
// use public-url instead of this text format, so their hashes remain valid.
const internalSourceText =
  /\b(?:sha(?:-?(?:1|256|512))?|csv|commit)\b|提交号|提交(?:哈希)?\s*[:：]?\s*[0-9a-f]{7,40}\b|\b[0-9a-f]{40}(?:[0-9a-f]{24})?\b|\b(?:main|master)\s*@\s*[0-9a-f]{7,40}\b|[^\s/@]+\/[^\s/@]+@[0-9a-f]{7,40}\b|(?:^|[\s「（(])(?:src|scripts|tests)\/[^\s]+/iu;
const mixedShortHash = /(?:^|[^a-z0-9])(?=[0-9a-f]{7,40}(?:$|[^a-z0-9]))(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}(?:$|[^a-z0-9])/iu;
export function isPublicSourceText(value) {
  if (typeof value !== 'string') return false;
  const withoutUrls = value.replace(/https?:\/\/[^\s<>"「」]+/giu, (url) => (isPublicSourceUrl(url) ? '' : url));
  if (internalSourceText.test(withoutUrls)) return false;
  const withoutGameVersions = withoutUrls.replace(/\bDE(?:\s*Update)?\s*[0-9]+\b/giu, '');
  return !mixedShortHash.test(withoutGameVersions);
}

export const publicFormats = {
  'public-url': { type: 'string', validate: isPublicSourceUrl },
  'source-text': { type: 'string', validate: isPublicSourceText },
};

/** JSON Schema validates shape first; compact references need a value check. */
export function constructionReferenceProblems(value) {
  if (!value || !Array.isArray(value.unitSets) || !Array.isArray(value.automaticSets) || !value.civs) return [];
  const problems = [];
  for (const [name, civ] of Object.entries(value.civs)) {
    for (const [field, pool] of [
      ['units', value.unitSets],
      ['automatic', value.automaticSets],
    ]) {
      const index = civ?.[field];
      if (!Number.isInteger(index) || index < 0 || index >= pool.length)
        problems.push({ path: `/civs/${name.replaceAll('~', '~0').replaceAll('/', '~1')}/${field}`, message: '共享字典索引超出范围' });
    }
  }
  return problems;
}
