import { describe, expect, it } from 'vitest';
import pins from '../../scripts/data_sources.json';
import { ASSET_SOURCE_PINS, DATA_PATCH, DATA_SOURCES, DATA_UPDATED, SOURCE_PINS, sourceCommitUrl, sourcePatchNoteUrl } from '../../src/data/sources';
import { TEACHING_COMPATIBILITY_188329 } from '../../src/data/teachingCompatibility188329';
import { CIV_MECHANISMS } from '../../src/domain/buildSimMechanisms';

describe('#801 来源 pin 访问器', () => {
  it('与 scripts/data_sources.json 逐项一致', () => {
    expect(DATA_SOURCES).toEqual(pins);
    expect(DATA_PATCH).toEqual(pins.patch);
    expect(SOURCE_PINS).toEqual(pins.sources);
    expect(ASSET_SOURCE_PINS).toEqual(pins.assetSources);
    expect(DATA_UPDATED).toBe(pins.updated);
    expect(sourceCommitUrl(SOURCE_PINS.dat)).toBe(`https://github.com/${SOURCE_PINS.dat.repo}/tree/${SOURCE_PINS.dat.commit}/${SOURCE_PINS.dat.path}`);
    expect(sourcePatchNoteUrl(DATA_PATCH.build)).toBe(`https://github.com/linhongcun/aoe2-analyzer/blob/main/docs/PATCH-NOTES/${DATA_PATCH.build}.md`);
  });

  it('每个机制都有 MODEL_SOURCE，evidence-pinned 带证据', () => {
    for (const [civ, model] of Object.entries(CIV_MECHANISMS)) {
      expect(model.source, civ).toBeDefined();
      expect(typeof model.source.patch, civ).toBe('number');
      if (model.source.status === 'evidence-pinned') expect(model.source.evidence, civ).toBeTruthy();
    }
  });

  it('冻结的教学 review pin 仍与当前 DAT 一致', () => {
    expect(TEACHING_COMPATIBILITY_188329.sources.dat.commit).toBe(SOURCE_PINS.dat.commit);
    expect(TEACHING_COMPATIBILITY_188329.sources.dat.sha256).toBe(SOURCE_PINS.dat.sha256);
  });
});
