import { describe, expect, it } from 'vitest';
import buildingsRaw from '../../src/data/buildings.json';
import { UNIT_ALIASES } from '../../src/data/aliases';
import type { Building } from '../../src/domain/types';
import {
  calculateSiege,
  SIEGE_DEFAULT_N,
  SIEGE_MANGONEL_REASON,
  SIEGE_STONE_DEFENSE_REASON,
  siegeBuildingEntryVerified,
  siegeUnitEntryVerified,
} from '../../src/domain/siege';
import { score, TIER } from '../../src/domain/search';
import { PAGES } from '../../src/shared/nav/pageRegistry';
import { unit } from './helpers';

const buildings = buildingsRaw as unknown as Building[];
const building = (id: number) => buildings.find((b) => b.id === id)!;
const castle = building(82);
const ram = unit('Battering Ram');

describe('攻城情境入口 #533', () => {
  it('已核实单位对城堡显示入口，投石车系和手推炮不显示', () => {
    for (const en of ['Battering Ram', 'Capped Ram', 'Siege Ram', 'Trebuchet (Packed)']) {
      expect(siegeUnitEntryVerified(unit(en), castle), en).toBe(true);
    }
    for (const en of ['Mangonel', 'Onager', 'Siege Onager', 'Bombard Cannon']) {
      expect(siegeUnitEntryVerified(unit(en), castle), en).toBe(false);
    }
  });

  it('建筑入口只给默认攻城锤已核实、且不是石墙或城门的对照建筑', () => {
    expect(siegeBuildingEntryVerified(building(109), ram)).toBe(true);
    expect(siegeBuildingEntryVerified(building(82), ram)).toBe(true);
    expect(siegeBuildingEntryVerified(building(79), ram)).toBe(true);
    expect(siegeBuildingEntryVerified(building(117), ram)).toBe(false);
    expect(siegeBuildingEntryVerified(building(487), ram)).toBe(false);
    expect(calculateSiege(ram, building(117), SIEGE_DEFAULT_N).verified).toBe(true);
  });

  it('未核实原因各一句，不改已核实金数', () => {
    expect(calculateSiege(unit('Mangonel'), castle, 1)).toEqual({ verified: false, reason: SIEGE_MANGONEL_REASON });
    expect(calculateSiege(unit('Bombard Cannon'), castle, 1)).toEqual({ verified: false, reason: SIEGE_STONE_DEFENSE_REASON });
    expect(calculateSiege(ram, building(109), 1)).toMatchObject({ verified: true, hits: 16, gameSeconds: 75 });
    expect(calculateSiege(ram, castle, 4)).toMatchObject({ verified: true, hits: 9, gameSeconds: 40 });
  });

  it('「冲车」命中攻城锤别名和攻城拆建筑页，官方名仍是攻城锤', () => {
    expect(UNIT_ALIASES[1258]).toContain('冲车');
    expect(unit('Battering Ram').zh).toBe('攻城锤');
    const page = PAGES.find((item) => item.key === 'siege');
    expect(page).toEqual(
      expect.objectContaining({
        label: '攻城拆建筑',
        en: 'Siege',
        path: '/siege',
        desc: '几台攻城单位拆一座建筑要多久',
        searchAliases: ['冲车'],
      }),
    );
    if (!page?.label || !page.en || page.desc === undefined || !page.searchAliases) throw new Error('siege page');
    expect(score({ kind: 'page', id: 'siege', zh: page.label, en: page.en, href: page.path, sub: page.desc, aliases: [...page.searchAliases] }, '冲车')).toBe(
      TIER.alias,
    );
  });
});
