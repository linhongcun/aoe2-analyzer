import { describe, expect, it } from 'vitest';
import {
  CASTLE_DEFENSE_SOURCES,
  CASTLE_ESCORTS,
  CASTLE_OBSERVATIONS,
  CASTLE_PATHS,
  CASTLE_RESOURCES,
  castleDefenseErrors,
  decodeCastleDefense,
  defaultCastleDefense,
  encodeCastleDefense,
  planCastleDefense,
  type CastleDefenseConfig,
} from '../../src/domain/castleDefense';

const config = (changes: Partial<CastleDefenseConfig> = {}): CastleDefenseConfig => ({ ...defaultCastleDefense(), ...changes });
const complete = (changes: Partial<CastleDefenseConfig> = {}) => config({ observation: 'completed', resources: 'blocked', ...changes });
const ids = (value: CastleDefenseConfig) => planCastleDefense(value)!.actions.map((action) => action.id);
const query = (changes: Record<string, string> = {}) => {
  const params = new URLSearchParams(encodeCastleDefense(config()));
  for (const [key, value] of Object.entries(changes)) params.set(key, value);
  return '?' + params.toString();
};

describe('#242 observations are explicit and unknown stays unknown', () => {
  it('starts with unconfirmed information instead of assuming a castle drop', () => {
    const value = config();
    expect(value.escort).toBe('unknown');
    expect(value.path).toBe('unknown');
    expect(value.resources).toBe('unknown');
    const plan = planCastleDefense(value)!;
    expect(plan.stage).toBe('stone');
    expect(plan.summary).toContain('还不能认定');
    expect(plan.actions.map((action) => action.id)).toEqual(['observe', 'prepare']);
    expect(plan.preparations).toEqual([]);
  });
  it('does not infer the completed-castle resource branch from an unknown input', () => {
    const unknown = planCastleDefense(complete({ resources: 'unknown' }))!;
    expect(unknown.stage).toBe('resources-unknown');
    expect(unknown.actions.map((action) => action.id)).toEqual(['verify', 'hold']);
    expect(unknown.preparations).toEqual([]);
    const movable = planCastleDefense(complete({ resources: 'movable' }))!;
    expect(movable.stage).toBe('relocate');
    expect(movable.actions.map((action) => action.id)).toContain('relocate');
    expect(planCastleDefense(complete())!.stage).toBe('blocked');
    expect(ids(complete())).toContain('remnant');
  });
  it('preserves a resource observation without letting it replace the current stage', () => {
    expect(planCastleDefense(config({ resources: 'blocked' }))!.stage).toBe('stone');
    expect(planCastleDefense(config({ observation: 'construction', resources: 'movable' }))!.stage).toBe('construction');
  });
  it.each(CASTLE_ESCORTS.flatMap((escort) => CASTLE_PATHS.map((path) => ({ escort, path }))))(
    'only offers a conditional intercept with confirmed absence and safe access: %j',
    ({ escort, path }) => {
      const value = config({ observation: 'construction', escort, path });
      const plan = planCastleDefense(value)!;
      expect(ids(value).includes('intercept')).toBe(escort === 'absent' && path === 'safe');
      if (escort === 'unknown') expect(plan.notices.join('')).toContain('不把未知当作没有护军');
      if (path !== 'safe') expect(plan.notices.join('')).toContain('不建议村民强冲');
    },
  );
  it('does not treat a replacement mine as proof of safe access', () => {
    const plan = planCastleDefense(complete({ resources: 'movable', path: 'unknown' }))!;
    expect(plan.notices.join('')).toContain('安全通路仍未确认');
    expect(plan.actions.find((action) => action.id === 'relocate')!.counterexample).toContain('途中有敌军');
  });
  it('never offers interception as a way to cancel a completed castle', () => {
    for (const resources of CASTLE_RESOURCES) expect(ids(complete({ resources, escort: 'absent', path: 'safe' }))).not.toContain('intercept');
    expect(planCastleDefense(complete({ resources: 'movable' }))!.summary).toContain('不能取消');
  });
});

describe('#242 era limits distinguish present checks and future preparations', () => {
  it.each([1, 2, 3, 4])('limits siege and defensive castle proposals at age %s', (age) => {
    const plan = planCastleDefense(complete({ age }))!;
    expect(plan.actions.some((action) => action.id === 'castle')).toBe(age >= 3);
    expect(plan.actions.some((action) => action.id === 'siege')).toBe(age >= 3);
    expect(plan.actions.some((action) => action.id === 'trebuchet')).toBe(age === 4);
    expect(plan.preparations.some((action) => action.id === 'future-trebuchet')).toBe(age < 4);
    expect(plan.preparations.some((action) => action.id === 'future-castle')).toBe(age < 3);
    if (age < 4) expect(plan.actions.map((action) => action.title + action.body).join('')).not.toContain('巨型投石机');
  });
  it('keeps actual civilization, prerequisites and protection conditional in Imperial Age', () => {
    const plan = planCastleDefense(complete({ age: 4 }))!;
    const treb = plan.actions.find((action) => action.id === 'trebuchet')!;
    expect(treb.body).toContain('本方科技树允许');
    expect(treb.body).toContain('生产建筑与资源齐全');
    expect(treb.body).toContain('保护');
    expect(plan.actions.find((action) => action.id === 'castle')!.body).toContain('施工者');
  });
  it('every reachable action has cost, counterexample, next observation and a known source', () => {
    const knownSources = new Set(CASTLE_DEFENSE_SOURCES.map((source) => source.id));
    const seen = new Set<string>();
    for (const observation of CASTLE_OBSERVATIONS)
      for (const age of [1, 2, 3, 4])
        for (const escort of CASTLE_ESCORTS)
          for (const path of CASTLE_PATHS)
            for (const resources of CASTLE_RESOURCES) {
              const value = config({ observation, age, escort, path, resources });
              const plan = planCastleDefense(value)!;
              for (const action of [...plan.actions, ...plan.preparations]) {
                seen.add(action.id);
                expect(action.cost.length).toBeGreaterThan(5);
                expect(action.counterexample.length).toBeGreaterThan(5);
                expect(action.next.length).toBeGreaterThan(5);
                expect(action.sources.length).toBeGreaterThan(0);
                expect(action.sources.every((source) => knownSources.has(source))).toBe(true);
              }
              expect(decodeCastleDefense(encodeCastleDefense(value))).toEqual({ config: value, errors: [] });
            }
    expect(seen.has('future-trebuchet')).toBe(true);
    expect(seen.has('trebuchet')).toBe(true);
    expect(CASTLE_DEFENSE_SOURCES.every((source) => new URL(source.url).protocol === 'https:')).toBe(true);
  });
});

describe('#242 shared observations fail closed rather than silently changing facts', () => {
  it('accepts an empty first visit and preserves every selected field in a reload', () => {
    expect(decodeCastleDefense('')).toEqual({ config: config(), errors: [] });
    const value = complete({ age: 4, escort: 'present', path: 'unsafe' });
    expect(decodeCastleDefense('?' + encodeCastleDefense(value))).toEqual({ config: value, errors: [] });
  });
  it.each([
    query({ dv: '2' }),
    query({ age: '03' }),
    query({ age: '2.0' }),
    query({ age: '' }),
    query({ age: 'NaN' }),
    query({ observation: 'nomad' }),
    query({ escort: 'no' }),
    query({ path: 'yes' }),
    query({ resources: 'none' }),
    query() + '&age=3',
    query() + '&extra=value',
    query() + '&bad=%FF',
    query() + '&bad=%',
    '?dv=1&observation=completed',
    '?dv=1&&observation=completed',
    '?age=4',
    '?' + 'x'.repeat(1201),
  ])('rejects damaged, duplicate, unsupported and partial query %s', (search) => {
    const decoded = decodeCastleDefense(search);
    expect(decoded.errors.length).toBeGreaterThan(0);
    expect(decoded.config).toEqual(defaultCastleDefense());
  });
  it.each([{ age: 0 }, { age: 5 }, { age: 1.5 }, { age: Infinity }, { observation: 'bad' }, { path: 'bad' }, { escort: null }, { resources: [] }])(
    'rejects invalid direct configuration %j',
    (changes) => {
      const value = { ...config(), ...changes } as CastleDefenseConfig;
      expect(castleDefenseErrors(value).length).toBeGreaterThan(0);
      expect(planCastleDefense(value)).toBeNull();
      expect(() => encodeCastleDefense(value)).toThrow();
    },
  );
});
