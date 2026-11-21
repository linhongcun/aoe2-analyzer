import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import type { Unit } from '../../src/domain/types';
import { CatalogStats } from '../../src/features/units/components/unitDetailParts';

function stats(unit: Unit): string {
  return renderToStaticMarkup(createElement(CatalogStats, { u: unit, base: unit, elite: false }));
}

describe('#1218 目录前摇读数', () => {
  it('缺少秒数时只显示已知的攻击间隔，不从帧值换算', () => {
    const unit = { ...CORE.unitById[39]! };
    delete unit.attackDelaySeconds;
    expect(unit.frameDelay).toBe(35);
    const markup = stats(unit);
    expect(markup).toContain('当前形态未收录前摇秒数');
    expect(markup).toContain('暂无数据');
    expect(markup).toContain('2 秒');
    expect(markup).not.toContain('35 秒');
  });

  it('仅缺帧值时保留原秒数及小数精度', () => {
    const unit = { ...CORE.unitById[474]! };
    delete unit.frameDelay;
    const markup = stats(unit);
    expect(markup).toContain('0.897 秒');
    expect(markup).not.toContain('暂无数据');
  });

  it('区别无普通攻击数据与零攻击间隔的一次性攻击', () => {
    const monk = CORE.unitById[125]!;
    expect(monk.rof).toBeGreaterThan(0);
    expect(stats(monk)).toContain('不适用：无普通攻击');
    expect(stats(monk)).not.toContain('出手前摇');

    const petard = CORE.unitById[440]!;
    expect(petard.rof).toBe(0);
    const markup = stats(petard);
    expect(markup).toContain('0 秒');
    expect(markup).toContain('爆炸单位，无攻击间隔');
    expect(markup).not.toContain('连续攻击时，两次出手的间隔');
  });
});
