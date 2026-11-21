import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore } from '../../src/data';
import type { Unit } from '../../src/domain/types';
import { UnitTransportCapacity } from '../../src/features/units/components/UnitTransportCapacity';

let transport: Unit;

beforeAll(async () => {
  transport = (await loadCore()).unitById[545]!;
});

function renderCapacity(garrisonCapacity: number | undefined) {
  return renderToStaticMarkup(createElement(UnitTransportCapacity, { unit: { ...transport, garrisonCapacity } }));
}

describe('#1220 载具基础容量的数据边界', () => {
  it.each([undefined, -1, 4.5, Infinity])('缺少可靠容量（%s）显示待核实', (value) => {
    const html = renderCapacity(value);
    expect(html).toContain('基础容量');
    expect(html).toContain('>待核实</dd>');
    expect(html).toContain('暂无可靠的基础载量。');
    expect(html).not.toContain('>20</dd>');
  });

  it('可靠的显式零与缺值不同', () => {
    const html = renderCapacity(0);
    expect(html).toContain('>0</dd>');
    expect(html).not.toContain('待核实');
  });
});
