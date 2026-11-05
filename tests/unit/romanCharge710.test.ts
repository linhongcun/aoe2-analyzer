import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import TechDetail from '../../src/features/techs/components/TechDetail';
const render = (location = '/tech/884') =>
  renderToStaticMarkup(
    createElement(StaticRouter, { location }, createElement(Routes, null, createElement(Route, { path: '/tech/:id', element: createElement(TechDetail) }))),
  );
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
beforeAll(async () => {
  await loadCore();
  await loadTrees();
});
describe('#710 蓄力资料现有页面验收', () => {
  it('884有三种合法形态的静态字段与未知边界', () => {
    const html = render();
    expect(html).toContain('aria-label="攻击类蓄力参数"');
    for (const id of [283, 1792, 1793]) expect(html).toContain(`data-charge-unit="${id}"`);
    for (const phrase of ['容量不等于额外伤害', '静态换算不是运行时冷却', '冲锋额外伤害', '触发距离', '待确认']) expect(text(html)).toContain(phrase);
  });
  it('884两个资料视图用训练措辞，不改原数值', () => {
    const overview = render();
    const values = [...overview.matchAll(/<span class="detail-stat-value" data-t="stat-value">([\s\S]*?)<\/span>/g)].map((match) => text(match[1]!));
    expect(values.length).toBeGreaterThan(0);
    expect(values).toContain('训练速度 +50%');
    expect(values).not.toContain('建造速度 +50%');
    const affects = text(render('/tech/884?tab=affects'));
    expect(affects).toContain('训练速度 +50%');
    expect(affects).not.toContain('建造速度 +50%');
  });
  it('非884仍保留扳指已有间隔投影', () => {
    const html = render('/tech/437');
    expect(html).not.toContain('aria-label="攻击类蓄力参数"');
    expect(text(html)).toContain('攻击间隔约 ×0.85');
  });
});

import { CHARGE_ATTACK_DATA, chargeExample } from '../../src/features/techs/chargeAttack710';
import { techEffectText } from '../../src/features/techs/techEffectText';
describe('#710 typed charge projection', () => {
  it('读取真实字段、合法模式与对象，不修改输入', async () => {
    const core = await loadCore(),
      trees = await loadTrees();
    const original = structuredClone(CHARGE_ATTACK_DATA),
      unitSnapshot = structuredClone(core.unitById);
    const e = chargeExample(CHARGE_ATTACK_DATA, 283, core.unitById, core.techById, trees)!;
    expect(e.before.max_charge).toBe(0);
    expect(e.after.max_charge).toBe(5);
    expect(e.after.recharge_rate).toBe(0.25);
    expect(e.seconds).toBe(20);
    const changed = structuredClone(CHARGE_ATTACK_DATA);
    changed.examples[0]!.after.max_charge = 9;
    changed.examples[0]!.after.recharge_rate = 0.5;
    expect(chargeExample(changed, 283, core.unitById, core.techById, trees)?.seconds).toBe(18);
    expect(CHARGE_ATTACK_DATA).toEqual(original);
    expect(core.unitById).toEqual(unitSnapshot);
  });
  it('合法但未核实模式/不可用/缺对象返回待确认，零速不伪造时长', async () => {
    const core = await loadCore(),
      trees = await loadTrees();
    for (const mode of ['charge_event', 'charge_type'] as const) {
      const data = structuredClone(CHARGE_ATTACK_DATA);
      data.examples[0]!.after[mode] = 0;
      expect(chargeExample(data, 283, core.unitById, core.techById, trees)).toBeNull();
    }
    expect(chargeExample(CHARGE_ATTACK_DATA, 569, core.unitById, core.techById, trees)).toBeNull();
    expect(chargeExample(CHARGE_ATTACK_DATA, 283, {}, core.techById, trees)).toBeNull();
    const u = structuredClone(core.unitById);
    u[283]!.civs = [];
    expect(chargeExample(CHARGE_ATTACK_DATA, 283, u, core.techById, trees)).toBeNull();
    const tree = structuredClone(trees);
    for (const b of tree.t.Romans!) for (const c of b[3]) if (c[2] === 't' && c[3] === 884) c[4] = 0;
    expect(chargeExample(CHARGE_ATTACK_DATA, 283, core.unitById, core.techById, tree)).toBeNull();
    const zero = structuredClone(CHARGE_ATTACK_DATA);
    zero.examples[0]!.after.recharge_rate = 0;
    expect(chargeExample(zero, 283, core.unitById, core.techById, trees)?.seconds).toBeNull();
    const overflow = structuredClone(CHARGE_ATTACK_DATA);
    overflow.examples[0]!.after.max_charge = 1e308;
    overflow.examples[0]!.after.recharge_rate = 1e-308;
    expect(chargeExample(overflow, 283, core.unitById, core.techById, trees)).toBeNull();
  });
  it('措辞适配仅884且保留其它文本和原数值', () => {
    expect(techEffectText(884, '建造速度 +50% / 建造时间 -33.33%')).toBe('训练速度 +50% / 训练时间 -33.33%');
    expect(techEffectText(437, '建造速度 +50%')).toBe('建造速度 +50%');
  });
});
