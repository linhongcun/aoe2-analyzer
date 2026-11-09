import { describe, expect, it } from 'vitest';
import { trainingCycle, type TrainingCycleOp } from '../../src/domain/trainingCycle';

const train = (op: string, v: number): TrainingCycleOp => ({ kind: 'train', op, v });
const work = (op: string, v: number): TrainingCycleOp => ({ kind: 'work', op, v });

describe('共享训练周期求值（issue 855）', () => {
  it('空操作返回基础秒数', () => {
    expect(trainingCycle(100, [])).toEqual({ cycle: 100, seconds: 100 });
  });

  it('train 的 set/mul/add 在两种结果中顺序一致', () => {
    const ops = [train('set', 80), train('mul', 1.5), train('add', 5)];
    expect(trainingCycle(100, ops)).toEqual({ cycle: 125, seconds: 125 });
  });

  it('work 的 set/mul/add 同时更新工作倍率与分离结果', () => {
    const ops = [work('set', 2), work('add', 1), work('mul', 1.5)];
    const result = trainingCycle(100, ops);
    expect(result.seconds).toBeCloseTo(100 / 4.5, 12);
    expect(result.cycle).toBeCloseTo(100 / 4.5, 12);
  });

  it('train/work 交错时 cycle 按顺序乘除，seconds 等价', () => {
    const ops = [train('mul', 2), work('mul', 2), train('mul', 3)];
    expect(trainingCycle(100, ops)).toEqual({ cycle: 300, seconds: 300 });
  });

  it('work 先归零再加回时，分离结果仍可恢复（cycle 不保证）', () => {
    const ops = [work('mul', 0), work('add', 2), train('mul', 3)];
    expect(trainingCycle(100, ops).seconds).toBe(150);
  });

  it('只有乘法时 cycle 与逐步参照完全一致，seconds 保留分离累计顺序', () => {
    const ops = [train('mul', 1.1), work('mul', 1.0909), train('mul', 1.0833), work('mul', 0.9)];
    let expected = 100;
    for (const op of ops) expected = op.kind === 'train' ? expected * op.v : expected / op.v;
    const result = trainingCycle(100, ops);
    expect(result.cycle).toBe(expected);
    // production 的独立累计：train 依次相乘，work 依次相乘，最后才相除。
    expect(result.seconds).toBe((100 * 1.1 * 1.0833) / (1.0909 * 0.9));
    expect(result.seconds).not.toBe(result.cycle);
  });
});
