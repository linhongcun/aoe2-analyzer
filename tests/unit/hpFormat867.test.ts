import { describe, expect, it } from 'vitest';
import raw from '../../src/data/buildings.json';
import { civBonuses, bonusExample } from '../../src/domain/civBonus';
import { buildingType } from '../../src/domain/buildings';
import { formatHp } from '../../src/domain/hpFormat';
import { fmtStat } from '../../src/shared/utils/simFormat';
import { simulate } from '../../src/domain/simulator';
import type { Building, Civ } from '../../src/domain/types';
import civsRaw from '../../src/data/civs.json';
import { ctx, unit, units } from './helpers';

const civs = civsRaw as unknown as Civ[];
const civ = (en: string) => civs.find((c) => c.en === en)!;
const buildings = (raw as unknown as Building[]).map((b) => ({ ...b, dlc: null, type: buildingType(b.en) }));
const none = new Set<number>();

describe('#867 生命保持浮点，只在展示时保留两位', () => {
  it('两位展示：葡萄牙连乘 186.74，土耳其 187.50，整数也补齐', () => {
    expect(formatHp(186.7374530945)).toBe('186.74');
    expect(formatHp(187.5)).toBe('187.50');
    expect(formatHp(155)).toBe('155.00');
    expect(formatHp(150)).toBe('150.00');
    expect(fmtStat('hp', 187.5)).toBe('187.50');
    expect(fmtStat('atk', 18)).toBe('18');
  });

  it('模拟器返回原始生命，展示字符串不会写回结果', () => {
    const galleon = simulate(ctx, unit('Galleon'), 'Portuguese', 4, none, none);
    const cannon = simulate(ctx, unit('Elite Cannon Galleon'), 'Turks', 4, none, none);
    expect(galleon.hp).toBeCloseTo(186.7374530945, 8);
    expect(cannon.hp).toBe(187.5);
    expect(galleon.hp).not.toBe(186);
    expect(galleon.hp).not.toBe(187);
    expect(cannon.hp).not.toBe(187);
    expect(cannon.hp).not.toBe(188);
    expect(formatHp(galleon.hp)).toBe('186.74');
    expect(formatHp(cannon.hp)).toBe('187.50');
    expect(Number(formatHp(galleon.hp))).not.toBe(galleon.hp);
  });

  it('加成示例与模拟器使用同一原始生命，页面各自格式化', () => {
    const portuguese = bonusExample(civBonuses(civ('Portuguese'))[3]!, units, buildings)!;
    const turks = bonusExample(civBonuses(civ('Turks'))[3]!, units, buildings)!;
    const galleonRow = portuguese.rows.find((row) => row[1] === 'hp' && row[0].includes(4));
    const turkRow = turks.rows.find((row) => row[1] === 'hp' && row[0].includes(4));
    expect(portuguese.id).toBe(unit('Galleon').id);
    expect(turks.id).toBe(unit('Elite Cannon Galleon').id);
    expect(galleonRow?.[3]).toBeCloseTo(186.7374530945, 8);
    expect(turkRow?.[3]).toBe(187.5);
    expect(formatHp(galleonRow![3])).toBe(formatHp(simulate(ctx, unit('Galleon'), 'Portuguese', 4, none, none).hp));
    expect(formatHp(turkRow![3])).toBe('187.50');
  });
});
