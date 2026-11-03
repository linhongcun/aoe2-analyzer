import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import civs from '../../src/data/raw/civs';
import manifest from '../../src/features/civs/backgrounds.json';
import source from '../../src/features/civs/backgrounds.source.json';
import { civBackground } from '../../src/features/civs/backgrounds';
import { CivBackground } from '../../src/features/civs/components/CivBackground';

const directory = new URL('../../src/features/civs/assets/backgrounds/', import.meta.url);
const assets: Record<string, (typeof source.assets)[keyof typeof source.assets]> = source.assets;

describe('#662 文明背景与固定来源', () => {
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
});
