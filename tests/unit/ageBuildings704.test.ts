import { describe, expect, it } from 'vitest';
import eco from '../../src/data/raw/eco';
import buildings from '../../src/data/raw/buildings';
import { ageReqOk, type EcoData } from '../../src/domain/buildSim';

const requirements = (eco as unknown as EcoData).ageReq!;
const built = (...ids: number[]) => new Map(ids.map((id) => [id, 1]));

describe('升时代说明的DE来源边界 #704', () => {
  it('两种常规建筑满足门槛，重复同类与房屋农田墙塔不满足', () => {
    for (const [age, pair] of [
      [2, [68, 562]],
      [3, [87, 103]],
      [4, [209, 49]],
    ] as const) {
      expect(ageReqOk(requirements[age]!.req, built(...pair), 'Franks')).toBe(true);
      expect(ageReqOk(requirements[age]!.req, new Map([[pair[0], 2]]), 'Franks')).toBe(false);
      expect(ageReqOk(requirements[age]!.req, built(70, 50, 72, 117, 79), 'Franks')).toBe(false);
    }
  });

  it('帝王单城堡/营垒与高棉免前置均有真实条件树', () => {
    for (const id of [82, 1251]) expect(ageReqOk(requirements[4]!.req, built(id), 'Bulgarians')).toBe(true);
    for (const age of [2, 3, 4]) expect(ageReqOk(requirements[age]!.req, built(), 'Khmer')).toBe(true);
  });

  it('所有公开示例均有当前建筑详情', () => {
    for (const id of [68, 562, 584, 12, 45, 87, 101, 103, 84, 209, 49, 104, 82, 1251, 70, 50, 72, 117, 79]) {
      expect(buildings.find((building) => building.id === id)?.zh).toBeTruthy();
    }
  });
});
