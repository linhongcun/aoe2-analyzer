import { beforeAll, describe, expect, it } from 'vitest';
import { civByEn, loadCore, type Core } from '../../src/data';
import { openingText } from '../../src/domain/civOpening';
import { findUniqueTech } from '../../src/domain/linker';
import { civDisplayText, civOpeningDisplayText } from '../../src/features/civs/displayNames';

let core: Core;
beforeAll(async () => {
  core = await loadCore();
});

describe('#470 蜀详情局部名称展示', () => {
  it('旧中文跟随实际单位名，保留正常英文和输入记录', () => {
    const c = civByEn('Shu')!;
    const before = JSON.stringify(c);
    const display = civDisplayText(c.uu, c.en, core);
    expect(display).toContain(core.unitById[1959]!.zh);
    expect(display).not.toContain('白毦卫');
    expect(display).toContain(core.unitById[1959]!.en);
    expect(JSON.stringify(c)).toBe(before);
  });

  it('开局沿用兵种规范化，再将实际科技1069英文名显示为中文', () => {
    const c = civByEn('Shu')!;
    const tech = core.techById[1069]!;
    const normalized = openingText(c.op, core.units);
    expect(civOpeningDisplayText(c.op, c.en, core)).toBe(normalized.split(tech.en).join(tech.zh));
    expect(civOpeningDisplayText(c.op, c.en, core)).not.toContain(tech.en);
  });

  it('先解析独特科技原串，仅转换说明中的旧中文，科技身份与英文保持', () => {
    const c = civByEn('Shu')!;
    const parsed = findUniqueTech(c.ct, c.en, core.techs)!;
    expect(parsed.tech.id).toBe(1070);
    expect(civDisplayText(parsed.rest, c.en, core)).toContain(core.unitById[1959]!.zh);
    expect(parsed.en).toBe(core.techById[1070]!.en);
    expect(parsed.zh).toBe(core.techById[1070]!.zh);
  });

  it('其它文明保持原显示流程，不新增同名替换', () => {
    const text = '白毦卫 (White Feather Guard) / Bolt Magazine';
    expect(civDisplayText(text, 'Britons', core)).toBe(text);
    expect(civOpeningDisplayText(text, 'Britons', core)).toBe(openingText(text, core.units));
  });

  it('异步核心未就绪时保留原文，数据到达后重新计算', () => {
    const c = civByEn('Shu')!;
    expect(civDisplayText(c.uu, c.en, null)).toBe(c.uu);
    expect(civOpeningDisplayText(c.op, c.en, null)).toBe(c.op);
    expect(civDisplayText(c.uu, c.en, core)).not.toBe(c.uu);
    expect(civOpeningDisplayText(c.op, c.en, core)).not.toBe(c.op);
  });

  it('对应单位或科技缺失时保留原文或原兵种规范化结果', () => {
    const c = civByEn('Shu')!;
    const missing: Core = { ...core, unitById: {}, techById: {} };
    expect(civDisplayText(c.uu, c.en, missing)).toBe(c.uu);
    expect(civOpeningDisplayText(c.op, c.en, missing)).toBe(openingText(c.op, core.units));
  });
});
