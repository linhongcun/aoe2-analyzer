import { describe, expect, it } from 'vitest';
import {
  CONTENT_QUERY_LIMIT,
  CONTENT_URL_LIMIT,
  contentAcquisitionLabel,
  contentCatalog,
  contentEvidenceState,
  contentGuideErrors,
  contentGuideShareUrl,
  contentIncludedProductsLabel,
  contentPrerequisiteLabel,
  contentProductById,
  contentProducts,
  decodeContentGuide,
  defaultContentGuide,
  encodeContentGuide,
  filterContentProducts,
  matchingContentBlocks,
  validateContentCatalog,
  type ContentGuideState,
} from '../../src/domain/contentCatalog';
import { CIV_DLC, DLCS } from '../../src/domain/dlc';

const state = (changes: Partial<ContentGuideState> = {}) => ({ ...defaultContentGuide(), ...changes });
const ids = (changes: Partial<ContentGuideState>) => filterContentProducts(state(changes)).map((product) => product.id);
const product = (id: string) => structuredClone(contentProductById(id)!);

describe('#239 verified Steam catalog and independent historical releases', () => {
  it('validates the fixed 17-product snapshot with unique identities and official evidence', () => {
    expect(validateContentCatalog()).toEqual([]);
    expect(contentProducts).toHaveLength(17);
    expect(contentCatalog).toMatchObject({ platform: 'steam', verifiedAt: '2026-10-20', baseProductId: 'base', region: 'unspecified-public-store' });
    expect(new Set(contentProducts.map((entry) => entry.id)).size).toBe(17);
    expect(new Set(contentProducts.map((entry) => entry.steamAppId)).size).toBe(17);
    expect(JSON.stringify(contentCatalog)).not.toMatch(/"(?:price|discount|currency)"/);
  });
  it('keeps the 14 historical releases and all 56 civilization introductions', () => {
    expect(DLCS.map((entry) => entry.civs.length)).toEqual([13, 5, 5, 4, 4, 4, 2, 2, 3, 1, 2, 5, 3, 3]);
    expect(Object.keys(CIV_DLC)).toHaveLength(56);
    expect(CIV_DLC.Burgundians).toBe(6);
    expect(contentAcquisitionLabel(product('lords-of-the-west'))).toBe('当前本体已包含');
  });
  it.each(['lords-of-the-west', 'dawn-of-the-dukes', 'dynasties-of-india'])('%s is included and cites the existing-owner gift rule separately', (id) => {
    const entry = product(id);
    expect(entry.acquisition.kind).toBe('included-with-base');
    expect(product('base').includedProductIds).toContain(id);
    expect(entry.sources.find((source) => source.id === 'gift-announcement')).toMatchObject({ status: 'verified', publishedAt: '2024-11-14' });
    expect(contentPrerequisiteLabel(entry)).toBe('需 Steam 版决定版本体');
  });
  it('splits RoR from standard Romans and retains all seven campaign entitlements', () => {
    const entry = product('return-of-rome');
    expect(entry.contents.find((block) => block.mode === 'aoe2')?.names.map((name) => name.id)).toEqual(['aoe2:Romans']);
    expect(entry.contents.find((block) => block.mode === 'return-of-rome' && block.kind === 'civilizations')?.names).toHaveLength(17);
    expect(entry.contents.find((block) => block.kind === 'campaigns')?.names).toHaveLength(7);
    expect(entry.contents.find((block) => block.mode === 'return-of-rome')?.names.find((name) => name.en === 'Romans')?.id).toBe('return-of-rome:Romans');
  });
  it.each(['chronicles-battle-for-greece', 'chronicles-alexander-the-great'])('%s requires only the base and has three non-ranked civilizations', (id) => {
    const entry = product(id);
    expect(entry.prerequisites.productIds).toEqual(['base']);
    expect(entry.contents.find((block) => block.kind === 'civilizations')?.names).toHaveLength(3);
    expect(entry.contents.every((block) => block.mode === 'chronicles')).toBe(true);
    expect(entry.contents.flatMap((block) => block.names).every((name) => !name.siteCivEn)).toBe(true);
    expect(entry.modeNotes?.join(' ')).toContain('不进排位');
  });
  it('retains a verified music product with genuinely unverified prerequisite ownership', () => {
    const entry = product('soundtrack');
    expect(contentAcquisitionLabel(entry)).toBe('另购');
    expect(contentPrerequisiteLabel(entry)).toBe('前置条件暂未核实');
    expect(entry.prerequisites.productIds).toEqual([]);
    expect(entry.prerequisites.status).toBe('unverified');
    expect(contentPrerequisiteLabel(product('base'))).toBe('本体商品，无其他前置');
  });
  it('distinguishes optional free graphics and three purely cosmetic packs', () => {
    expect(contentAcquisitionLabel(product('enhanced-graphics'))).toBe('免费可选下载');
    expect(contentPrerequisiteLabel(product('enhanced-graphics'))).toBe('需 Steam 版决定版本体');
    const cosmetics = filterContentProducts(state({ kind: 'cosmetics' }));
    expect(cosmetics).toHaveLength(3);
    expect(cosmetics.every((entry) => entry.contents.length === 1 && entry.contents[0]?.count === 8)).toBe(true);
  });
  it.each(['unverified', 'stale', 'conflict'] as const)('does not make affirmative purchase claims when required evidence is %s', (status) => {
    const entry = product('lords-of-the-west');
    entry.sources.find((source) => source.id === 'base-package')!.status = status;
    expect(contentEvidenceState(entry, entry.acquisition.sourceIds)).toBe(status);
    expect(contentAcquisitionLabel(entry)).toBe('暂未核实');
  });
  it('treats missing evidence as unverified instead of guessing dependencies', () => {
    const entry = product('return-of-rome');
    entry.sources = [];
    expect(contentAcquisitionLabel(entry)).toBe('暂未核实');
    expect(contentPrerequisiteLabel(entry)).toBe('前置条件暂未核实');
    expect(contentEvidenceState(entry, [])).toBe('unverified');
  });
  it.each(['unverified', 'stale', 'conflict'] as const)('also downgrades base inclusion claims when the relationship evidence is %s', (status) => {
    const entry = product('base');
    entry.sources[0]!.status = status;
    expect(contentIncludedProductsLabel(entry)).toBe('本体包含关系暂未核实，请到 Steam 确认。');
    expect(contentIncludedProductsLabel(entry)).not.toContain('已包含');
  });
  it('rejects broken references, duplicate products, dependency cycles and false inclusion claims', () => {
    const broken = structuredClone(contentCatalog);
    broken.products[0]!.prerequisites.productIds = ['return-of-rome'];
    broken.products[0]!.includedProductIds = [];
    broken.products[1]!.acquisition.sourceIds.push('missing');
    broken.products.push(structuredClone(broken.products[0]!));
    expect(validateContentCatalog(broken).join(' ')).toMatch(/重复/);
    expect(validateContentCatalog(broken).join(' ')).toMatch(/成环/);
    expect(validateContentCatalog(broken).join(' ')).toMatch(/包含关系/);
    expect(validateContentCatalog(broken).join(' ')).toMatch(/来源引用missing不存在/);
  });
});

describe('#239 same-content-block filtering', () => {
  it('shows the full fixed catalog on an empty visit', () => expect(filterContentProducts(defaultContentGuide())).toHaveLength(17));
  it('does not combine RoR standard Romans with RoR-only campaigns', () => {
    expect(ids({ mode: 'aoe2', kind: 'campaigns' })).not.toContain('return-of-rome');
    expect(ids({ mode: 'return-of-rome', kind: 'campaigns' })).toEqual(['return-of-rome']);
    expect(ids({ mode: 'aoe2', kind: 'civilizations' })).toContain('return-of-rome');
    expect(matchingContentBlocks(product('return-of-rome'), state({ mode: 'aoe2', kind: 'civilizations' }))).toHaveLength(1);
  });
  it('keeps mode, kind, text and product filters in intersection', () => {
    expect(ids({ mode: 'aoe2', kind: 'civilizations', pack: 'return-of-rome', q: 'Trajan' })).toEqual([]);
    expect(ids({ mode: 'return-of-rome', kind: 'campaigns', pack: 'return-of-rome', q: 'Trajan' })).toEqual(['return-of-rome']);
    expect(ids({ mode: 'chronicles', kind: 'cosmetics' })).toEqual([]);
  });
  it.each(['Ragnar', 'victors', '征服与陨落', 'ＶＩＣＴＯＲＳ'])('finds the pure single-player scenario pack through %s', (q) => {
    expect(ids({ q })).toEqual(['victors-and-vanquished']);
  });
  it('searches Chinese standard civilization names and retains exact product context', () => {
    expect(ids({ q: '勃艮第', mode: 'aoe2', kind: 'civilizations' })).toEqual(['lords-of-the-west']);
    expect(ids({ pack: 'base' })).toEqual(['base']);
    expect(ids({ pack: 'base', mode: 'chronicles' })).toEqual([]);
  });
  it('classifies ancient Three Kingdoms and newer packs as standard AoE2', () => {
    for (const id of ['the-three-kingdoms', 'the-last-chieftains', 'the-viking-sagas']) {
      expect(ids({ mode: 'aoe2', kind: 'civilizations' })).toContain(id);
      expect(ids({ mode: 'chronicles' })).not.toContain(id);
    }
    expect(ids({ mode: 'chronicles', kind: 'civilizations' })).toHaveLength(2);
  });
});

describe('#239 strict versioned URL state and complete links', () => {
  it('uses defaults only on empty first visit and supports explicit pack-only campaign context', () => {
    expect(decodeContentGuide('')).toEqual({ state: defaultContentGuide(), errors: [], blocked: false });
    expect(decodeContentGuide('?pack=base')).toEqual({ state: state({ pack: 'base' }), errors: [], blocked: false });
  });
  it('round-trips every facet and preserves text, whitespace, Unicode and newlines', () => {
    const config = state({ q: ' 亚历山大\nA&B=古代 ', mode: 'chronicles', kind: 'campaigns', pack: 'chronicles-alexander-the-great' });
    expect(decodeContentGuide(encodeContentGuide(config))).toEqual({ state: config, errors: [], blocked: false });
  });
  it.each([
    'v=1&q=&mode=all&kind=all&pack=all&pack=base',
    'v=1&q=&mode=all&kind=all&pack=all&unknown=1',
    'v=1&q=&mode=all&kind=all&pack=all&%70ack=base',
    'v=2&q=&mode=all&kind=all&pack=all',
    'v=1&pack=base',
    'q=Romans',
    'pack=base&pack=base',
    'pack=%E0%A4%A',
    'pack=%FF',
    'pack=%',
    'v=1&q=%ED%A0%80&mode=all&kind=all&pack=all',
  ])('blocks structurally damaged URL %s without silently showing default results', (query) => {
    const decoded = decodeContentGuide(query);
    expect(decoded.blocked).toBe(true);
    expect(decoded.errors.length).toBeGreaterThan(0);
  });
  it('rejects overlong URLs before parsing', () => {
    expect(decodeContentGuide('q=' + 'a'.repeat(CONTENT_URL_LIMIT)).blocked).toBe(true);
  });
  it('retains unsupported enums for correction and pauses results/sharing', () => {
    const config = state({ q: 'keep this', mode: 'future-mode', kind: 'future-kind', pack: 'future-pack' });
    const decoded = decodeContentGuide(encodeContentGuide(config));
    expect(decoded).toMatchObject({ state: config, blocked: false });
    expect(decoded.errors).toHaveLength(3);
    expect(filterContentProducts(decoded.state)).toEqual([]);
    expect(() => contentGuideShareUrl(config, 'https://example.com/project/')).toThrow();
    expect(decodeContentGuide('pack=future-pack').state.pack).toBe('future-pack');
  });
  it('preserves rather than truncates over-limit search text', () => {
    const q = '中'.repeat(CONTENT_QUERY_LIMIT + 1);
    const decoded = decodeContentGuide(encodeContentGuide(state({ q })));
    expect(decoded.blocked).toBe(false);
    expect(decoded.state.q).toBe(q);
    expect(decoded.errors).toHaveLength(1);
  });
  it('generates a full maximum-length Chinese link under a project base without unrelated parameters', () => {
    const config = state({ q: '中'.repeat(CONTENT_QUERY_LIMIT), pack: 'chronicles-alexander-the-great' });
    const url = new URL(contentGuideShareUrl(config, 'https://example.com/aoe2-analyzer/?unrelated=secret#/units'));
    expect(url.pathname).toBe('/aoe2-analyzer/content-guide/');
    expect(url.hash).toBe('');
    expect(url.searchParams.has('unrelated')).toBe(false);
    expect(decodeContentGuide(url.search).state).toEqual(config);
    expect(contentGuideErrors(config)).toEqual([]);
    expect(url.href.length).toBeLessThan(CONTENT_URL_LIMIT);
  });
  it('does not return a truncated share link when the deployment base exceeds the limit', () => {
    expect(() => contentGuideShareUrl(state(), `https://example.com/${'a'.repeat(CONTENT_URL_LIMIT)}/`)).toThrow('超长');
  });
});
