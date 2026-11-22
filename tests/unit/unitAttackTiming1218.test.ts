import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { resolveUnitForm } from '../../src/features/units/unitFormDetail';
import type { Unit } from '../../src/domain/types';
import { CatalogStats } from '../../src/features/units/components/unitDetailParts';

function stats(unit: Unit): string {
  const catalog = createElement(CatalogStats, { u: unit, base: unit, elite: false });
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/', children: catalog }));
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

  it('仅缺帧值时保留秒数并按两位有效小数格式化', () => {
    const unit = { ...CORE.unitById[474]! };
    delete unit.frameDelay;
    const markup = stats(unit);
    expect(markup).toContain('0.9 秒');
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

describe('#1231 固定显示用间隔与目录基础间隔', () => {
  it('固定源只给四个差异单位新增读数，不改基础间隔', () => {
    const records = CORE.units
      .filter((unit) => unit.displayedReloadTime !== undefined)
      .map(({ id, rof, displayedReloadTime }) => [id, rof, displayedReloadTime])
      .sort((a, b) => a[0]! - b[0]!);
    expect(records).toEqual([
      [125, 1.6, 1],
      [775, 1.6, 1],
      [1908, 2.15, Math.fround(1.8)],
      [1910, 2.15, Math.fround(1.8)],
    ]);
  });

  it('非训练形态不显示训练形态的静态间隔对照', () => {
    const units = CORE.units.map((unit) => ({ ...unit, displayedReloadTime: 1 }));
    for (const owner of units) {
      if (!owner.form) continue;
      const result = resolveUnitForm({ ...CORE, units }, owner.form.id);
      expect(result.owner?.displayedReloadTime).toBe(1);
      expect(result.rawTarget?.displayedReloadTime).toBeUndefined();
    }
  });

  it('缺失、无效和容差内省略，含显式零和超过容差的边界', () => {
    const unit = CORE.unitById[1908]!;
    for (const displayedReloadTime of [undefined, NaN, Infinity, -Infinity, 0, 0.000009, 0.00001]) {
      expect(stats({ ...unit, rof: 0, displayedReloadTime })).not.toContain('ud-rof-diff');
    }
    for (const rof of [NaN, Infinity, -Infinity]) {
      expect(stats({ ...unit, rof })).not.toContain('ud-rof-diff');
    }
    expect(stats({ ...unit, rof: 0.000011, displayedReloadTime: 0 })).toContain('0.0 秒');
  });
});
