import { describe, expect, it } from 'vitest';
import civs from '../../data/game/civs.json';
import effects from '../../data/game/effects.json';
import techs from '../../data/game/techs.json';
import { parseCompareFact } from '../../src/domain/compareFactFormat';

const EXPECTED_DESC = '斥候骑兵系、草原枪兵和骑射手近战护甲 +1/远程护甲 +1';
const EXPECTED_CT = `丝护甲 (${EXPECTED_DESC})｜Silk Armor`;

describe('#1440 鞑靼城堡科技「丝护甲」文明简述与科技 687 / 效果表一致', () => {
  it('Tatars.ct 精确对齐科技 687，保留帝王科技与拼音字段，且不影响女真 #518 简述', () => {
    const tatars = civs.find((item) => item.en === 'Tatars')!;
    const tech687 = techs.find((item) => item.id === 687)!;

    expect(tech687.zh).toBe('丝护甲');
    expect(tech687.en).toBe('Silk Armor');
    expect(tech687.desc).toBe(`${EXPECTED_DESC}。`);

    expect(tatars.ct).toBe(EXPECTED_CT);
    expect(tatars.ct).toBe(`${tech687.zh} (${tech687.desc.replace(/。$/, '')})｜${tech687.en}`);
    expect(tatars.it).toBe('帖木儿攻城术 (巨型投石机射程 +2)｜Timurid Siegecraft');
    expect({ py: tatars.py, pyi: tatars.pyi }).toEqual({ py: 'dada', pyi: 'dd' });
    expect(JSON.stringify(civs)).not.toContain('斥候骑兵系和草原枪兵的近战护甲 +1/远程护甲 +1');

    const jurchens = civs.find((item) => item.en === 'Jurchens')!;
    expect(jurchens.ct).toBe('强化堡垒 (防御工事每分钟恢复 500 生命值)｜Fortified Bastions');
  });

  it('对比表解析器将 Tatars.ct 拆分为主名、英文名与含骑射手的说明', () => {
    const tatars = civs.find((item) => item.en === 'Tatars')!;
    expect(parseCompareFact(tatars.ct)).toEqual({
      main: '丝护甲',
      en: 'Silk Armor',
      desc: EXPECTED_DESC,
    });
  });

  it('DE 188329 效果表中 Silk Armor 对含骑射手(39)和重骑射(474)在内的 28 个目标提供近/远甲各 +1', () => {
    const silkArmor = effects.techs['Silk Armor'];
    expect(silkArmor).toBeDefined();
    expect(silkArmor.id).toBe(687);

    const targets = new Set(silkArmor.rules.flatMap((rule) => rule.t));
    expect(targets.size).toBe(28);
    expect(targets.has(39)).toBe(true);
    expect(targets.has(474)).toBe(true);

    const caRule = silkArmor.rules.find((rule) => rule.t.includes(39) && rule.t.includes(474));
    expect(caRule).toBeDefined();
    expect(caRule!.fx).toEqual(
      expect.arrayContaining([
        { s: 'ma', v: 1 },
        { s: 'pa', v: 1 },
      ]),
    );
  });
});
