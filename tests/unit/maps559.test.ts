import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapPositions } from '../../src/features/maps/positions';

const civs = new Set((JSON.parse(readFileSync('src/data/civs.json', 'utf8')) as { en: string }[]).map((civ) => civ.en));
const BANNED = /胜率|Elo|样本|分段|aoestats|#\/ladder/i;
const WIRE = [
  '步弓射程长，适合边路对射。',
  '弓更便宜，边路可以一直补。',
  '弓射得更快，升时代还有资源。',
  '骑射便宜，边路不必只走步弓。',
  '骑兵更厚，发育后好去帮边路。',
  '圣物加攻击，骑士能早点出门。',
  '城镇中心更快，中路先养经济再出骑。',
  '不用房屋，中路骑士转得快。',
];

describe('地图边路 / 中路编辑稿 #559', () => {
  it('阿拉伯半岛两侧各 3–8 个站内文明，理由不写天梯口径', () => {
    const arabia = mapPositions.arabia;
    expect(arabia?.mode).toBe('open-4v4');
    for (const side of ['flank', 'pocket'] as const) {
      const tips = arabia?.[side] ?? [];
      expect(tips.length).toBeGreaterThanOrEqual(3);
      expect(tips.length).toBeLessThanOrEqual(8);
      expect(new Set(tips.map((tip) => tip.civ)).size).toBe(tips.length);
      for (const tip of tips) {
        expect(civs.has(tip.civ)).toBe(true);
        expect(tip.reason.length).toBeGreaterThan(1);
        expect(tip.reason).not.toMatch(BANNED);
        expect(WIRE).not.toContain(tip.reason);
      }
    }
  });

  it('黑森林没有位置稿；有稿的一侧要么空着要么落在 3–8', () => {
    expect(mapPositions['black-forest']).toBeUndefined();
    for (const [id, entry] of Object.entries(mapPositions)) {
      expect(entry.mode).toBe('open-4v4');
      for (const side of ['flank', 'pocket'] as const) {
        const count = entry[side].length;
        expect(count === 0 || (count >= 3 && count <= 8), `${id} ${side}`).toBe(true);
      }
    }
  });
});
