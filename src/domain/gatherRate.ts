/** 采集速率的纯公式（issue 798）；不包含效果解释、文明准入或取整策略。 */
export interface GatherRateInput {
  workRate: number;
  carry: number;
  speed: number;
  walkTiles: number;
  noReturnWalk?: boolean;
  units?: number;
}

const walkTime = ({ speed, walkTiles, noReturnWalk = false }: GatherRateInput): number => (noReturnWalk ? 0 : (2 * walkTiles) / speed);

/** 每趟时间（秒）：采集 + 往返走路。 */
export function tripTime(input: GatherRateInput): number {
  return input.carry / input.workRate + walkTime(input);
}

/** 有效采集速率（资源/秒）：无走路时就是 workRate。 */
export function effectiveGatherRate(input: GatherRateInput): number {
  const walk = walkTime(input);
  return ((input.units ?? 1) * input.carry) / (input.carry / input.workRate + walk);
}
