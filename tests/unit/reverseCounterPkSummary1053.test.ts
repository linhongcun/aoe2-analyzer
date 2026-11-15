import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { selectPkSummaryMode } from '../../src/features/units/components/ReverseCounterPkSummary';
import { PkAvailability } from '../../src/features/units/components/ReverseCounterAvailability';
import type { Trees } from '../../src/domain/types';

let core: Core;
let trees: Trees;

beforeAll(async () => {
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
});

function availabilityMarkup(showReady: boolean, counterId = 93) {
  const unit = core.unitById[93]!;
  return renderToStaticMarkup(
    createElement(PkAvailability, {
      target: unit,
      counter: core.unitById[counterId]!,
      targetCiv: 'Armenians',
      counterCiv: 'Armenians',
      age: 1,
      core,
      trees,
      treesPending: false,
      treesError: false,
      retryTrees: () => {},
      showReady,
    }),
  );
}

describe('反向目录 PK 摘要来源（#1053）', () => {
  it('部分结果即使保留所选行，也只显示经基础目录核实的摘要', () => {
    expect(selectPkSummaryMode(true, 'partial', true, true)).toBe('retained');
  });

  it('完整筛选结果只显示目录内已验证的摘要', () => {
    expect(selectPkSummaryMode(true, 'ready', true, true)).toBe('filtered');
    expect(selectPkSummaryMode(true, 'ready', false, true)).toBe('retained');
    expect(selectPkSummaryMode(true, 'partial', true, false)).toBeNull();
  });

  it('保留摘要时隐藏“双方可用”成功提示但仍显示单位不可用原因', () => {
    expect(availabilityMarkup(false)).toBe('');
    expect(availabilityMarkup(false, 359)).toContain('不会更换当前单位形态');
  });
});
