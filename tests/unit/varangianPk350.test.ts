import { describe, expect, it } from 'vitest';
import { duel, fighterFrom } from '../../src/domain/duel';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { varangianPkNotes } from '../../src/features/duel/logic/varangianNotes';
import { ctx, units } from './helpers';

const side = (id: number, civ: string, age = 4) => {
  const u = units.find((x) => x.id === id)!;
  const S = simulate(ctx, u, civ, age, presetUpTo(simTechs(ctx, u, civ), age, civ), new Set());
  return { u, S, F: fighterFrom(u, S) };
};

describe('#350 瓦兰吉卫队 PK 计入标注', () => {
  it('精锐瓦兰吉人列出攻速与产金已计入，哥瑟砍改为勾选后由未建模卡统一提示', () => {
    const a = side(2704, 'Varangians');
    const notes = varangianPkNotes(2704, 'Varangians', 4, a.S.rof);
    expect(notes.map((n) => [n.id, n.status, n.label, n.reason])).toEqual([
      ['vg-rof', 'counted', '攻击速度 +25%', '已反映在攻击间隔 1.6s'],
      ['vg-gold', 'counted', '产生的黄金 +50%', '游戏说明写 +50%，数据里约为 ×1.33。本场黄金已按这个倍率估算。'],
    ]);
    expect(notes.map((n) => `${n.label} ${n.reason}`).join('\n')).not.toMatch(/每秒|每次|work_value/);
  });

  it('城堡时代的普通瓦兰吉卫队同样列出攻速与产金', () => {
    expect(varangianPkNotes(2703, 'Varangians', 3, 1.6).map((n) => n.id)).toEqual(['vg-rof', 'vg-gold']);
  });

  it('拜占庭、丹麦、撒克逊、维京只列各自常驻/非勾选加成（拜占庭后勤学改由勾选触发）', () => {
    expect(varangianPkNotes(2704, 'Byzantines', 4)).toEqual([]);
    expect(varangianPkNotes(2703, 'Byzantines', 3)).toEqual([]);
    expect(varangianPkNotes(2704, 'Danes', 4).map((n) => [n.id, n.status])).toEqual([
      ['danes-spd', 'uncounted'],
      ['danes-hamask', 'uncounted'],
    ]);
    expect(varangianPkNotes(2704, 'Saxons', 4).map((n) => n.id)).toEqual(['sax-shield']);
    expect(varangianPkNotes(2703, 'Saxons', 3)).toEqual([]);
    expect(varangianPkNotes(2704, 'Vikings', 4).map((n) => [n.id, n.status, n.reason])).toEqual([['vik-hp', 'counted', '已反映在生命值']]);
    for (const civ of ['Byzantines', 'Danes', 'Saxons', 'Vikings']) {
      const ids = varangianPkNotes(2704, civ, 4).map((n) => n.id);
      expect(ids).not.toContain('vg-rof');
      expect(ids).not.toContain('vg-gold');
      expect(ids).not.toContain('vg-gothikon');
      expect(ids).not.toContain('byz-logistica');
    }
  });

  it('不是瓦兰吉卫队时不列', () => {
    expect(varangianPkNotes(567, 'Teutons', 4)).toEqual([]);
    expect(varangianPkNotes(567, 'Varangians', 4)).toEqual([]);
  });

  it('1v1 数值不变：条顿冠军获胜、用时 6s、剩余生命 10/70', () => {
    const a = side(2704, 'Varangians');
    const b = side(567, 'Teutons');
    const r = duel(a.F, b.F);
    expect(a.S.rof).toBeCloseTo(1.6);
    expect(b.F.hp).toBe(70);
    expect(r.winner).toBe('b');
    expect(r.duration).toBe(6);
    expect(r.remaining).toBe(10);
  });
});
