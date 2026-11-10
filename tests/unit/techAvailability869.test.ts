import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auditSources, checkRepo, contractErrors, displayForbiddenArea, questionFileErrors } from '../../scripts/check-tech-availability.mjs';
import { AVAILABILITY_CHECK_LIMITS, AVAILABILITY_EXCEPTIONS, TECH_AVAILABILITY } from '../../src/domain/techAvailability';

const ALL = ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'] as const;
const ARMENIAN_75 = 'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Armenians:75=1';
const BOHEMIANS = 'civ-age:src/domain/production.ts:productionTechAge:Bohemians:literal:3:id===47';
const BURGUNDIANS = 'civ-age:src/domain/production.ts:productionTechAge:Burgundians:max(literal:1,age-1):ecoTechs+isGatherTech';
const DISPLAY = 'display-age:src/domain/availabilityAge.ts:displayUnitAge:SPEARMAN_UNIT_ID:Armenians=1:other=2';
const SPEARMAN_FLOOR = 'unit-floor:src/domain/availabilityAge.ts:trainingUnitAge:SPEARMAN_UNIT_ID:then=2:else=1';
const KNOWN = [
  'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Armenians:358=2',
  'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Armenians:359=3',
  'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Armenians:473=3',
  ARMENIAN_75,
  'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Armenians:77=2',
  'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Bohemians:5=3',
  'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Burgundians:283=3',
  'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Cumans:1258=2',
  'age-map:src/domain/availabilityAge.ts:EARLY_UNIT_AGES:Cumans:422=3',
  BOHEMIANS,
  BURGUNDIANS,
  DISPLAY,
  SPEARMAN_FLOOR,
];

describe('#869 科技可用性例外必须点名', () => {
  it('现有点名例外仍被扫到，四套问题也不能收成一个', () => {
    const result = checkRepo();
    expect(result.errors).toEqual([]);
    expect(result.sites.map((site) => site.key)).toEqual(KNOWN);
    expect(AVAILABILITY_EXCEPTIONS.map((item) => item.site).sort()).toEqual(KNOWN);
    const bySite = new Map(AVAILABILITY_EXCEPTIONS.map((item) => [item.site, item]));
    expect(bySite.get(BURGUNDIANS)?.role).toBe('tech-age');
    expect(bySite.get(BURGUNDIANS)?.differs).toEqual(['civStatus', 'techAvailable', 'simTechs']);
    expect(bySite.get(BOHEMIANS)?.differs).toEqual(['civStatus', 'techAvailable', 'simTechs']);
    expect(bySite.get(DISPLAY)?.role).toBe('display-only');
    expect(bySite.get(DISPLAY)?.differs).toEqual(ALL);
    expect(bySite.get(SPEARMAN_FLOOR)?.role).toBe('unit-age');
    expect(bySite.get(ARMENIAN_75)?.differs).toEqual(ALL);
    expect(result.sites.find((site) => site.key === BURGUNDIANS)?.usedBy).toEqual(['productionTechs']);
    expect(result.sites.find((site) => site.kind === 'display-age')?.usedBy).toEqual([]);
    expect(result.sites.filter((site) => ['civStatus', 'techAvailable', 'simTechs'].includes(site.owner))).toEqual([]);
    expect(Object.keys(TECH_AVAILABILITY)).toEqual(ALL);
    expect(new Set(Object.values(TECH_AVAILABILITY).map((item) => item.asks)).size).toBe(4);
    expect(TECH_AVAILABILITY.civStatus.consumer).toBe('src/features/tree/logic/layout.ts');
    expect(TECH_AVAILABILITY.techAvailable.consumer).toBe('src/features/matchup/availability.ts');
    expect(TECH_AVAILABILITY.productionTechs.consumer).toBe('src/features/production/Production.tsx');
    expect(TECH_AVAILABILITY.simTechs.consumer).toBe('src/shared/hooks/useSimState.ts');
    for (const phrase of ['不能拦一切任意新代码', '全科技', '不比较四套', '新建文件', '字面量']) expect(AVAILABILITY_CHECK_LIMITS).toContain(phrase);
  });

  it('新手写文明时代缺声明会失败，只重复文明名或少写差异也不通过', () => {
    const text = `
      export function productionTechAge(t: { id: number; age: number }, civ: string) {
        const mentioned = ['Franks', 'Burgundians'];
        void mentioned;
        if (civ === 'Franks' && t.id === 22) return 1;
        return t.age;
      }
    `;
    const key = 'civ-age:src/domain/production.ts:productionTechAge:Franks:literal:1:id===22';
    const namedOnly = auditSources(
      [{ name: 'src/domain/production.ts', text }],
      [{ site: 'Franks', role: 'tech-age', differs: ['civStatus', 'techAvailable', 'simTechs'], because: '这里只重复了文明名，没有结构键' }],
    );
    expect(namedOnly.sites.map((site: { key: string }) => site.key)).toEqual([key]);
    expect(namedOnly.errors.some((error: string) => error.includes(`缺声明：${key}`))).toBe(true);
    expect(namedOnly.errors.some((error: string) => error.includes('声明没有对应的手写例外：Franks'))).toBe(true);

    const shortList = auditSources(
      [{ name: 'src/domain/production.ts', text }],
      [{ site: key, role: 'tech-age', differs: ['civStatus'], because: '差异集合没有写全，不能只点一个名字' }],
    );
    expect(shortList.errors.some((error: string) => error.includes('differs 必须是 civStatus、techAvailable、simTechs'))).toBe(true);
  });

  it('直接 import 的新时代表也不能靠文明名通过', () => {
    const result = auditSources(
      [
        {
          name: 'src/domain/production.ts',
          text: `
            import { FRANK_AGES } from './frankAges';
            export function productionTechAge(t: { id: number; age: number }, civ: string) {
              const note = 'Franks';
              void note;
              if (civ === 'Franks') return FRANK_AGES.Franks[22];
              return t.age;
            }
          `,
        },
        { name: 'src/domain/frankAges.ts', text: 'export const FRANK_AGES = { Franks: { 22: 1 } };\n' },
      ],
      [{ site: 'Franks', role: 'unit-age', differs: ALL, because: '只把文明名再写一遍不算点名' }],
    );
    const key = 'age-map:src/domain/frankAges.ts:FRANK_AGES:Franks:22=1';
    expect(result.sites.map((site: { key: string }) => site.key)).toEqual([key]);
    expect(result.sites.find((site) => site.key === key)?.usedBy).toEqual(['productionTechs']);
    expect(result.errors.some((error: string) => error.includes(`缺声明：${key}`))).toBe(true);
    expect(result.errors.some((error: string) => error.includes('声明没有对应的手写例外：Franks'))).toBe(true);
  });

  it('声明指向已经不存在的例外会失败', () => {
    const result = auditSources(
      [{ name: 'src/domain/production.ts', text: 'export function productionTechAge(t: { age: number }, civ: string) { void civ; return t.age; }\n' }],
      [
        {
          site: 'civ-age:src/domain/production.ts:productionTechAge:Franks:literal:1:plain',
          role: 'tech-age',
          differs: ['civStatus', 'techAvailable', 'simTechs'],
          because: '这条规则已经不在源码里',
        },
      ],
    );
    expect(result.errors).toContain('声明没有对应的手写例外：civ-age:src/domain/production.ts:productionTechAge:Franks:literal:1:plain');
  });

  it('引用另一张常量表，或用函数生成声明，都不算登记', () => {
    const errors = contractErrors(`
      const ALL = ['civStatus', 'techAvailable', 'productionTechs', 'simTechs'];
      export const AVAILABILITY_CHECK_LIMITS = '不能拦一切任意新代码 全科技 不比较四套 新建文件 字面量';
      export const TECH_AVAILABILITY = {};
      function row(civ: string) {
        return { site: civ, role: 'unit-age', differs: ALL, because: '函数生成的声明' };
      }
      export const AVAILABILITY_EXCEPTIONS = [row('Franks'), { site: 'x', role: 'unit-age', differs: ALL, because: '引用另一张常量表不算' }];
    `);
    expect(errors.some((error: string) => error.includes('对象字面量'))).toBe(true);
    expect(errors.some((error: string) => error.includes('字面量'))).toBe(true);
  });

  it('展示时代被生产、费用或战斗引用会失败，单位展示文件不在此列', () => {
    const production = auditSources(
      [
        {
          name: 'src/domain/production.ts',
          text: "import { displayUnitAge } from './availabilityAge';\nexport const age = displayUnitAge(93, 1, 'Franks');\n",
        },
      ],
      [],
    );
    expect(production.errors.some((error: string) => error.includes('displayUnitAge') && error.includes('生产'))).toBe(true);
    const cost = auditSources(
      [{ name: 'src/domain/costPolicy.ts', text: "import { unitDisplayAge } from '../features/units/displayAge';\nvoid unitDisplayAge;\n" }],
      [],
    );
    expect(cost.errors.some((error: string) => error.includes('unitDisplayAge') && error.includes('费用'))).toBe(true);
    expect(displayForbiddenArea('src/domain/duel.ts')).toBe('战斗');
    expect(displayForbiddenArea('src/domain/buildSim.ts')).toBe('开局模拟');
    expect(displayForbiddenArea('src/features/production/Production.tsx')).toBe('生产');
    expect(displayForbiddenArea('src/features/units/displayAge.ts')).toBeNull();
    expect(displayForbiddenArea('src/features/home/Home.tsx')).toBeNull();
  });

  it('合成 isAvailable 或改调另一套会失败', () => {
    const merged = auditSources(
      [
        {
          name: 'src/domain/unitAvailability.ts',
          text: "export function isAvailable(civ: string) { void civ; return true; }\nexport function techAvailable() { return isAvailable('Franks'); }\n",
        },
      ],
      [],
    );
    expect(merged.errors.some((error: string) => error.includes('isAvailable'))).toBe(true);
    const crossed = auditSources([{ name: 'src/domain/unitAvailability.ts', text: 'export function techAvailable() { return productionTechs(); }\n' }], []);
    expect(crossed.errors.some((error: string) => error.includes('调用了 productionTechs'))).toBe(true);
  });

  it('displayUnitAge 丢掉文明展示分支会失败', () => {
    const stripped = readFileSync('src/domain/availabilityAge.ts', 'utf8').replace("civ === 'Armenians' ? 1 : 2", 'catalogAge');
    const result = auditSources([{ name: 'src/domain/availabilityAge.ts', text: stripped }], []);
    expect(result.errors.some((error: string) => error.includes('displayUnitAge') && error.includes('没有扫到嵌套三元或等价 if/return'))).toBe(true);
    expect(result.errors.some((error: string) => error.includes('恰好一处'))).toBe(false);
  });

  it('等价 if/return 展示改写可以登记，改时代才要换结构键', () => {
    const declaration = {
      site: DISPLAY,
      role: 'display-only',
      differs: ALL,
      because: '长矛兵展示时代仍是亚美尼亚 1、其他文明 2。这是等价改写，不是判定语义错误。',
    };
    const forms = [
      `export function displayUnitAge(id: number, catalogAge: number, civ = ''): number {
        if (id === SPEARMAN_UNIT_ID) {
          if (civ === 'Armenians') return 1;
          return 2;
        }
        return catalogAge;
      }`,
      `export function displayUnitAge(id: number, catalogAge: number, civ = ''): number {
        if (id !== SPEARMAN_UNIT_ID) return catalogAge;
        return civ === 'Armenians' ? 1 : 2;
      }`,
    ];
    for (const body of forms) {
      const result = auditSources([{ name: 'src/domain/availabilityAge.ts', text: body + '\n' }], [declaration]);
      expect(result.errors).toEqual([]);
      expect(result.sites.map((site) => site.key)).toEqual([DISPLAY]);
    }
    const changed = auditSources(
      [
        {
          name: 'src/domain/availabilityAge.ts',
          text: `export function displayUnitAge(id: number, catalogAge: number, civ = ''): number {
            if (id === SPEARMAN_UNIT_ID) {
              if (civ === 'Armenians') return 3;
              return 2;
            }
            return catalogAge;
          }\n`,
        },
      ],
      [declaration],
    );
    const next = DISPLAY.replace('Armenians=1', 'Armenians=3');
    expect(changed.errors.some((error: string) => error.includes(`缺声明：${next}`))).toBe(true);
    expect(changed.errors.some((error: string) => error.includes(`声明没有对应的手写例外：${DISPLAY}`))).toBe(true);
    expect(changed.errors.some((error: string) => error.includes('没有扫到嵌套三元或等价 if/return'))).toBe(false);
  });

  it('四套可以共享主要消费者文件，注释里重复名字仍然不算', () => {
    const shared = 'src/features/sharedConsumer.ts';
    const questions = [
      { id: 'civStatus', asks: '格子是否点亮', definedIn: 'src/domain/civStatus.ts', exportName: 'civStatus', consumer: shared },
      { id: 'simTechs', asks: '格子点亮且有效果规则', definedIn: 'src/domain/simulator.ts', exportName: 'simTechs', consumer: shared },
    ];
    const imported = questionFileErrors(questions, [
      {
        name: shared,
        text: "import { civStatus } from '../domain/civStatus';\nimport { simTechs } from '../domain/simulator';\nvoid civStatus;\nvoid simTechs;\n",
      },
    ]);
    expect(imported).toEqual([]);
    const commentOnly = questionFileErrors(questions, [{ name: shared, text: '// civStatus\n// simTechs\nexport const note = 1;\n' }]);
    expect(commentOnly.some((error: string) => error.includes('没有以值导入'))).toBe(true);
    expect(commentOnly.some((error: string) => error.includes('不能是同一个文件'))).toBe(false);
  });
});
