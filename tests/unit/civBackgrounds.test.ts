import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import civs from '../../src/data/raw/civs';
import manifest from '../../data/reference/civs/backgrounds.json';
import source from '../../data/reference/civs/backgrounds.source.json';
import { CIV_ART_REPO_URL, civBackground, resolveSideArtCiv } from '../../src/shared/utils/civBackgrounds';
import { CivArtCredit } from '../../src/shared/ui/CivArtCredit';
import { CivArtLayer } from '../../src/shared/ui/CivArtLayer';
import { CivBackground, CivIllustrationCredit } from '../../src/features/civs/components/CivBackground';

const directory = new URL('../../src/shared/assets/civ-backgrounds/', import.meta.url);
const assets: Record<string, (typeof source.assets)[keyof typeof source.assets]> = source.assets;

describe('#662 文明背景与固定来源', () => {
  it('有文明映射但缺少本地资源时不输出署名', async () => {
    vi.resetModules();
    vi.doMock('../../data/reference/civs/backgrounds.json', () => ({
      default: { ...manifest, assets: { ...manifest.assets, Wei: { ...manifest.assets.Wei, file: 'missing-local-resource.webp' } } },
    }));
    try {
      const { civBackground: missingBackground } = await import('../../src/shared/utils/civBackgrounds');
      const { CivIllustrationCredit: MissingCredit } = await import('../../src/features/civs/components/CivBackground');
      expect(manifest.assets.Wei).toBeDefined();
      expect(missingBackground('Wei')).toBeUndefined();
      expect(renderToStaticMarkup(createElement(MissingCredit, { civ: 'Wei' }))).toBe('');
    } finally {
      vi.doUnmock('../../data/reference/civs/backgrounds.json');
      vi.resetModules();
    }
  });
  it('署名单独显示，背景正文不再输出署名', () => {
    const credit = renderToStaticMarkup(createElement(CivIllustrationCredit, { civ: 'Wei' }));
    expect(credit).toContain(civBackground('Wei')!.sourceUrl);
    expect(credit).toContain('© Microsoft');
    expect(credit).toContain('背景插画 · AoE2 Companion');
    expect(renderToStaticMarkup(createElement(CivIllustrationCredit, { civ: 'Unknown' }))).toBe('');
    expect(renderToStaticMarkup(createElement(CivBackground, { civ: 'Wei', children: '正文' }))).not.toContain('AoE2 Companion');
  });
  it('当前文明、来源清单、运行时清单及本地文件一一覆盖', () => {
    const names = civs.map((civ) => civ.en).sort();
    expect(Object.keys(source.assets).sort()).toEqual(names);
    expect(Object.keys(manifest.assets).sort()).toEqual(names);
    expect(readdirSync(directory).sort()).toEqual(
      Object.values(source.assets)
        .map((asset) => asset.file)
        .sort(),
    );
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(source.repo).toBe('denniske/aoe2companion');
    expect(manifest.commit).toBe(source.commit);
  });

  it.each(civs.map((civ) => civ.en))('%s：实际WebP字节、尺寸、透明度与固定清单一致', (civ) => {
    const asset = assets[civ]!;
    const data = readFileSync(new URL(asset.file, directory));
    expect(createHash('sha256').update(data).digest('hex')).toBe(asset.outputSha256);
    expect(data.length).toBe(asset.outputBytes);
    expect(data.length).toBeLessThanOrEqual(300 * 1024);
    expect(data.toString('ascii', 0, 4)).toBe('RIFF');
    expect(data.toString('ascii', 8, 12)).toBe('WEBP');
    // Lossless VP8L尺寸及alpha标志，直接检查文件，而不是只相信JSON里的数字。
    expect(data.toString('ascii', 12, 16)).toBe('VP8L');
    expect(data[20]).toBe(0x2f);
    const bits = data.readUInt32LE(21);
    expect(1 + (bits & 0x3fff)).toBe(asset.width);
    expect(1 + ((bits >>> 14) & 0x3fff)).toBe(asset.height);
    expect((bits >>> 28) & 1).toBe(1);
    const background = civBackground(civ)!;
    expect(background).toBeDefined();
    expect(background.image).not.toMatch(/^data:|^https?:/);
    expect(background.sourceUrl).toBe('https://github.com/' + source.repo + '/blob/' + source.commit + '/' + asset.sourcePath);
    expect(asset.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.sourcePath).toMatch(/^assets\/history\/civs2?\/history_[a-z]+\.png$/);
  });

  it('保留上游共图关系与印度斯坦的特殊文件名，不按名称猜图', () => {
    expect(source.assets.Hindustanis.sourcePath).toBe('assets/history/civs/history_hindustani.png');
    expect(source.assets.Bohemians.sourceSha256).toBe(source.assets.Teutons.sourceSha256);
    expect(source.assets.Italians.sourceSha256).toBe(source.assets.Sicilians.sourceSha256);
  });

  it('未知文明只保留正文和主题底，不生成虚构图片或来源', () => {
    expect(civBackground('Unknown')).toBeUndefined();
    const html = renderToStaticMarkup(createElement(CivBackground, { civ: 'Unknown', children: createElement('p', null, '原有正文') }));
    expect(html).toContain('原有正文');
    expect(html).not.toContain('has-civ-art');
    expect(html).not.toContain('data-civ-background');
    expect(html).not.toContain('<a ');
  });

  it('56 文明比例准确分为 36 张方图与 20 张宽图，且共享组件处理单/空/多文明与单处署名', () => {
    const ratios = civs.map((c) => civBackground(c.en)!.ratio);
    expect(ratios.filter((r) => r === 'square')).toHaveLength(36);
    expect(ratios.filter((r) => r === 'wide')).toHaveLength(20);
    expect(civBackground('Franks')!.ratio).toBe('square');
    expect(civBackground('Armenians')!.ratio).toBe('wide');

    expect(resolveSideArtCiv([])).toBeUndefined();
    expect(resolveSideArtCiv(['', null, undefined])).toBeUndefined();
    expect(resolveSideArtCiv(['Unknown'])).toBeUndefined();
    expect(resolveSideArtCiv(['Franks'])).toBe('Franks');
    expect(resolveSideArtCiv(['Franks', 'Franks'])).toBe('Franks');
    expect(resolveSideArtCiv(['Franks', 'Britons'])).toBeUndefined();
    expect(resolveSideArtCiv(['Franks', 'Unknown'])).toBeUndefined();

    const squareHtml = renderToStaticMarkup(createElement(CivArtLayer, { civ: 'Franks', side: 'a' }));
    expect(squareHtml).toContain('data-civ-art="Franks"');
    expect(squareHtml).toContain('data-ratio="square"');
    expect(squareHtml).toContain('data-side="a"');
    expect(squareHtml).toContain('aria-hidden="true"');
    expect(squareHtml).not.toContain('data-mirror');

    const headBandMirror = renderToStaticMarkup(createElement(CivArtLayer, { civ: 'Armenians', side: 'b', variant: 'head-band', mirror: true, muted: true }));
    expect(headBandMirror).toContain('is-head-band');
    expect(headBandMirror).toContain('is-muted');
    expect(headBandMirror).toContain('data-ratio="wide"');
    expect(headBandMirror).toContain('data-mirror="true"');
    expect(renderToStaticMarkup(createElement(CivArtLayer, { civ: '', side: 'a' }))).toBe('');
    expect(renderToStaticMarkup(createElement(CivArtLayer, { civ: 'Unknown', side: 'b' }))).toBe('');

    const creditHtml = renderToStaticMarkup(createElement(CivArtCredit, { civs: ['Franks', 'Armenians'] }));
    expect(creditHtml).toContain('文明背景插画');
    expect(creditHtml).toContain(CIV_ART_REPO_URL);
    expect(creditHtml).toContain('AoE2 Companion');
    expect(creditHtml).toContain('© Microsoft');
    expect(renderToStaticMarkup(createElement(CivArtCredit, { civs: [undefined, '', 'Unknown'] }))).toBe('');
  });
});
