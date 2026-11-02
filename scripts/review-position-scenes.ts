/** 核验辅助：仅打印当前效果形状，不能自动批准/覆盖审核指纹。 */
import { SCENARIO_CIVS, reviewPayload } from '../src/domain/positionScenarios';
import { sceneSignature } from '../src/domain/positionScenarioMath';
console.log(
  JSON.stringify(Object.fromEntries([...new Set(Object.values(SCENARIO_CIVS).flat())].map((c) => [c, sceneSignature(reviewPayload(c), true)])), null, 2),
);
