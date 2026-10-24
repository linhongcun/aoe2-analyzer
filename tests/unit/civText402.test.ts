import { describe, expect, it } from 'vitest';
import civs from '../../src/data/civs.json';
import techs from '../../src/data/techs.json';
import units from '../../src/data/units.json';

describe('#402 文明介绍的固定版本文字', () => {
  it('所有展示字段没有重复“可可”或残留条目圆点', () => {
    const bad: string[] = [];
    for (const civ of civs)
      for (const [field, value] of Object.entries(civ)) {
        const text = Array.isArray(value) ? value.filter((item) => typeof item === 'string').join('\n') : typeof value === 'string' ? value : '';
        if (/可可|•/.test(text)) bad.push(`${civ.en}.${field}: ${text}`);
      }
    expect(bad).toEqual([]);
  });
  it('马普切突袭使用同版本科技名称和说明，英文对照保留', () => {
    const tech = techs.find((item) => item.id === 1379)!;
    expect(civs.find((civ) => civ.en === 'Mapuche')!.ct).toBe(`${tech.zh} (${tech.desc.replace(/。$/, '')})｜${tech.en}`);
  });
  it('已在固定来源中的蔷琵与王家敕令译名及其数值保留', () => {
    expect(units.find((unit) => unit.id === 2552)!.zh).toBe('蔷琵战士');
    expect(techs.find((tech) => tech.id === 1496)!.zh).toBe('王家敕令骑兵');
    expect(civs.find((civ) => civ.en === 'Franks')!.ct).toBe('王家敕令骑兵 (骑马弩手花费的黄金 -40%)｜Ordonnance Companies');
    expect(civs.find((civ) => civ.en === 'Muisca')!.ct).toContain('蔷琵战士');
    expect(civs.find((civ) => civ.en === 'Tupi')!.ct).toContain('蔷琵战士');
    expect(civs.find((civ) => civ.en === 'Incas')!.it).toContain('蔷琵战士');
  });
});
