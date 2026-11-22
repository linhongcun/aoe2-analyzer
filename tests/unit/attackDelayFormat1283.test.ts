import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { formatAttackDelaySeconds } from '../../src/domain/attackDelayFormat';
import type { Tech, Trees, Unit } from '../../src/domain/types';
import { ConversionTarget } from '../../src/features/units/components/ConversionTarget';
import UnitGarrison from '../../src/features/units/components/UnitGarrison';

let core: Core;
let trees: Trees;

beforeAll(async () => {
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
});

function renderConversion(unit: Unit, civ?: string): string {
  return renderToStaticMarkup(
    createElement(StaticRouter, { location: `/unit/${unit.id}` }, createElement(ConversionTarget, { unit, civ, techs: core.techs as Tech[] })),
  );
}

describe('#1283 formatAttackDelaySeconds', () => {
  it.each([
    [0, '0'],
    [-0, '0'],
    [1, '1'],
    [0.5, '0.5'],
    [0.91, '0.91'],
    [0.671667, '0.67'],
    [0.897, '0.9'],
    [0.995556, '1'],
    [0.00001, '0.00001'],
  ] as const)('将 %s 格式化为 %s', (input, expected) => {
    expect(formatAttackDelaySeconds(input)).toBe(expected);
  });
});

describe('#1283 ConversionTarget 压缩态与完整态分流', () => {
  it('零抗性且无孟加拉加成时默认渲染紧凑收起态 details', () => {
    const paladin = core.unitById[569]!;
    const markup = renderConversion(paladin);
    expect(markup).toContain('data-conversion-target="panel"');
    expect(markup).toContain('data-conversion-compact="true"');
    expect(markup).toContain('<details class="ud-cr-compact"');
    expect(markup).not.toContain('<details class="ud-cr-compact" open');
    expect(markup).toContain('目标基础无额外招降抗性');
    expect(markup).toContain('0 / 0 / 0');
    expect(markup).toContain('展开详情');
  });

  it('存在非零目标基础抗性时保持完整展开态卡片', () => {
    const scout = core.unitById[448]!;
    const markup = renderConversion(scout);
    expect(markup).toContain('class="ud-cr-box"');
    expect(markup).not.toContain('data-conversion-compact="true"');
    expect(markup).toContain('含目标基础抗性');
    expect(markup).toContain('+3');
    expect(markup).toContain('+1');
  });

  it('零基础抗性象兵在无文明或孟加拉时保持完整态，切到非孟加拉文明时回落紧凑态', () => {
    const elephantArcher = core.unitById[873]!;
    for (const civ of [undefined, 'Bengalis'] as const) {
      const expanded = renderConversion(elephantArcher, civ);
      expect(expanded).toContain('class="ud-cr-box"');
      expect(expanded).not.toContain('data-conversion-compact="true"');
      expect(expanded).toContain('data-conversion-target="bengali"');
      expect(expanded).toContain('目标基础无额外抗性');
    }
    const gurjaras = renderConversion(elephantArcher, 'Gurjaras');
    expect(gurjaras).toContain('data-conversion-compact="true"');
    expect(gurjaras).toContain('<details class="ud-cr-compact"');
    expect(gurjaras).not.toContain('data-conversion-target="bengali"');
  });

  it('部分字段缺失时保持完整态并提示缺失，不误归为紧凑态', () => {
    const partialUnit: Unit = { ...core.unitById[569]!, conversionResistance: { chanceMod: 0, minTimeMod: 0 } };
    const markup = renderConversion(partialUnit);
    expect(markup).toContain('class="ud-cr-box"');
    expect(markup).not.toContain('data-conversion-compact="true"');
    expect(markup).toContain('部分抗性字段缺失');
    expect(markup).toContain('暂无数据');
  });
});

describe('#1283 UnitGarrison 未选文明就地选择器', () => {
  it('未选文明且传入 onSelectCiv 时渲染就地 CivPicker 且不输出建筑预览链接', () => {
    const markup = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/unit/569' },
        createElement(UnitGarrison, {
          core,
          trees,
          unitId: 569,
          civ: '',
          onSelectCiv: vi.fn(),
          error: false,
          pending: false,
          retry: vi.fn(),
        }),
      ),
    );
    expect(markup).toContain('id="garrison-civ"');
    expect(markup).toContain('选择文明后查看游侠的驻军建筑与火力结果');
    expect(markup).toContain('仅列出可训练游侠的文明');
    expect(markup).not.toContain('<a ');
    expect(markup).not.toContain('/building/');
  });
});
