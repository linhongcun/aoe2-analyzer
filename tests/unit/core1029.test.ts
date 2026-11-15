import { describe, expect, it } from 'vitest';
import { coreCache, loadCore } from '../../src/data';
import { buildCore, CORE } from '../../src/data/core';
import units from '../../src/data/raw/units';
import techs from '../../src/data/raw/techs';
import buildings from '../../src/data/raw/buildings';

/** #1029：核心目录同步与异步是同一个类型化对象。 */
describe('#1029 CORE', () => {
  it('loadCore() 与同步 CORE 是同一个对象，并写入 coreCache', async () => {
    expect(coreCache).toBeNull();
    const core = await loadCore();
    expect(core).toBe(CORE);
    expect(coreCache).toBe(CORE);
    expect(await loadCore()).toBe(CORE);
  });

  it('CORE 带派生字段和索引，条数与原始目录一致', () => {
    expect(CORE.units[0]!.dlc).toBeDefined();
    expect(CORE.techs[0]!.dlc).toBeDefined();
    expect(CORE.buildings[0]!.dlc).toBeDefined();
    expect(CORE.buildings[0]!.type).toBeDefined();
    expect(CORE.units).toHaveLength(units.length);
    expect(CORE.techs).toHaveLength(techs.length);
    expect(CORE.buildings).toHaveLength(buildings.length);
    for (const u of CORE.units) expect(CORE.unitById[u.id]).toBe(u);
    for (const t of CORE.techs) expect(CORE.techById[t.id]).toBe(t);
    for (const b of CORE.buildings) expect(CORE.buildingById[b.id]).toBe(b);
    expect(CORE.linker).toBeDefined();
    expect(CORE.fam).toBeDefined();
  });

  it('buildCore 是纯函数：不改入参，同样输入得到相等结果', () => {
    const snapshot = JSON.stringify(units[0]);
    const again = buildCore(units, techs, buildings);
    expect(JSON.stringify(units[0])).toBe(snapshot);
    expect(again).not.toBe(CORE);
    expect(again.units).toEqual(CORE.units);
    expect(again.techs).toEqual(CORE.techs);
    expect(again.buildings).toEqual(CORE.buildings);
  });
});
