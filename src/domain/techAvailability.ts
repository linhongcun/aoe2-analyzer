/**
 * issue 869：四套科技可用性是四个问题，不能收成一个 isAvailable，也不要求返回值相同。
 * 手写时代或文明例外登记在 AVAILABILITY_EXCEPTIONS。
 * `npm run availability:check` 读这份字面量，并对照源码里扫到的结构；缺声明、对不上或只重复文明名都会失败。
 * 边界见 AVAILABILITY_CHECK_LIMITS。不改这四套函数的判定。
 */

export type TechAvailabilityId = 'civStatus' | 'techAvailable' | 'productionTechs' | 'simTechs';

export interface TechAvailabilityQuestion {
  asks: string;
  definedIn: string;
  exportName: TechAvailabilityId;
  consumer: string;
}

export const TECH_AVAILABILITY: Record<TechAvailabilityId, TechAvailabilityQuestion> = {
  civStatus: {
    asks: '这个文明的科技树格子是否点亮。只读上游 node_status，不问时代，也不问效果或经济语义。',
    definedIn: 'src/domain/civStatus.ts',
    exportName: 'civStatus',
    consumer: 'src/features/tree/logic/layout.ts',
  },
  techAvailable: {
    asks: '目录里有这个文明，且所选时代不低于科技目录时代与科技树行时代的较大值。不看经济语义，也不使用生产口径里的手写提前。',
    definedIn: 'src/domain/unitAvailability.ts',
    exportName: 'techAvailable',
    consumer: 'src/features/matchup/availability.ts',
  },
  productionTechs: {
    asks: '科技树格子点亮，时代走 productionTechAge，并且这条科技有经济或生产语义。勃艮第采集科技提前一级，波希米亚化学另写为城堡时代。',
    definedIn: 'src/domain/production.ts',
    exportName: 'productionTechs',
    consumer: 'src/features/production/Production.tsx',
  },
  simTechs: {
    asks: '科技树格子点亮，且效果表里有能作用到该单位的规则，含独特科技和纯文本项。不问生产时代，也不调用 techAvailable。',
    definedIn: 'src/domain/simulator.ts',
    exportName: 'simTechs',
    consumer: 'src/shared/hooks/useSimState.ts',
  },
};

export type AvailabilityExceptionRole = 'tech-age' | 'unit-age' | 'display-only';

export interface AvailabilityException {
  site: string;
  role: AvailabilityExceptionRole;
  differs: readonly TechAvailabilityId[];
  because: string;
}

export const AVAILABILITY_EXCEPTIONS: readonly AvailabilityException[] = [
  {
    site: 'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Armenians:75=1',
    role: 'unit-age',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '单位 75（Armenians）提前到时代 1，只供单位可用性与训练时代。四套科技判定不读这张表。',
  },
  {
    site: 'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Armenians:77=2',
    role: 'unit-age',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '单位 77（Armenians）提前到时代 2，只供单位可用性与训练时代。四套科技判定不读这张表。',
  },
  {
    site: 'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Armenians:473=3',
    role: 'unit-age',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '单位 473（Armenians）提前到时代 3，只供单位可用性与训练时代。四套科技判定不读这张表。',
  },
  {
    site: 'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Armenians:358=2',
    role: 'unit-age',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '单位 358（Armenians）提前到时代 2，只供单位可用性与训练时代。四套科技判定不读这张表。',
  },
  {
    site: 'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Armenians:359=3',
    role: 'unit-age',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '单位 359（Armenians）提前到时代 3，只供单位可用性与训练时代。四套科技判定不读这张表。',
  },
  {
    site: 'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Cumans:1258=2',
    role: 'unit-age',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '单位 1258（Cumans）提前到时代 2，只供单位可用性与训练时代。四套科技判定不读这张表。',
  },
  {
    site: 'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Cumans:422=3',
    role: 'unit-age',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '单位 422（Cumans）提前到时代 3，只供单位可用性与训练时代。四套科技判定不读这张表。',
  },
  {
    site: 'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Burgundians:283=3',
    role: 'unit-age',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '单位 283（Burgundians）提前到时代 3，只供单位可用性与训练时代。四套科技判定不读这张表。',
  },
  {
    site: 'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Bohemians:5=3',
    role: 'unit-age',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '单位 5（Bohemians）提前到时代 3，只供单位可用性与训练时代。四套科技判定不读这张表。',
  },
  {
    site: 'civ-age:src/domain/production.ts:productionTechAge:Burgundians:max(literal:1,age-1):ecoTechs+isGatherTech',
    role: 'tech-age',
    differs: ['civStatus', 'techAvailable', 'simTechs'],
    because: '生产口径对采集科技使用目录时代减一，最低为黑暗。科技树点亮、目录与树行时代、模拟器规则都不读这条提前。',
  },
  {
    site: 'civ-age:src/domain/production.ts:productionTechAge:Bohemians:literal:3:id===47',
    role: 'tech-age',
    differs: ['civStatus', 'techAvailable', 'simTechs'],
    because: '生产口径把波希米亚化学（科技 47）写成时代 3。techs.json 里该科技的目录时代是 4。另外三套不使用这个手写时代。',
  },
  {
    site: 'unit-floor:src/domain/availabilityAge.ts:trainingUnitAge:SPEARMAN_UNIT_ID:then=2:else=1',
    role: 'unit-age',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '长矛兵训练时代下限是 2（封建），写在 trainingUnitAge。它不是四套科技判定，也不替代 displayUnitAge 的展示时代。',
  },
  {
    site: 'display-age:src/domain/availabilityAge.ts:displayUnitAge:SPEARMAN_UNIT_ID:Armenians=1:other=2',
    role: 'display-only',
    differs: ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'],
    because: '长矛兵展示时代：亚美尼亚为 1，其他文明为 2。只给单位列表和详情。不得用于生产、费用或战斗。',
  },
];

export const AVAILABILITY_CHECK_LIMITS =
  '能发现的范围：civStatus、techAvailable、productionTechs、productionTechAge、simTechs、availabilityAge 所在五个文件里，函数声明和赋给 const 的函数中的手写文明时代分支（返回 1–4，或对 .age 做加减，或 Math.max/min 包住它们）、单位编号时代下限，以及 displayUnitAge 的展示分支。也包括这些文件直接 import 的 src/domain 绑定里，形状为「文明名、编号、时代字面量」三层的表。site、role、differs、because 都必须是源码里的字面量；指向另一张常量表不算登记。只重复文明名、声明对不上、多出来的声明、或出现名为 isAvailable 的函数，都会失败。上述函数若直接调用另一套，也会失败。displayUnitAge、unitDisplayAge、projectUnitDisplayAges 被点名过的生产、费用、战斗或开局模拟文件 import，会失败。' +
  '不能发现的范围：不在上述文件、也没有被它们直接 import 的新建文件；对象方法或类方法；不返回时代字面量的文明分支；动态拼出的文明名；namespace 或动态 import；把判断藏进别的名字而不是 isAvailable。展示 import 只拦当前点名的路径。不比较四套的返回值，也不跑全科技×全文明。不能拦一切任意新代码。';
