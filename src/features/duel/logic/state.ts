/** 单位 PK 的 URL 状态：?a=<单位id>.<文明>.<时代>.<科技>.<团队>&b=...&m=1|n|r&na=&nb=&bud=
 *  科技字段：'f' = 满科技，'c' = 当前时代满科技，'' = 无科技，否则为以 '-' 分隔的科技 id */
export type TechSpec = 'f' | 'c' | number[];
export interface SideSpec {
  uid: number;
  civ: string;
  age: number;
  /** URL 里是否写了时代；未写时等资源按单位最早可用时代取价（#24） */
  ageSet?: boolean;
  techs: TechSpec;
  team: number[];
}
/** 't' = 等资源里的「等采集时间」（#88），预算参数 vil / min，默认 10/10 不写进 URL */
export type Mode = '1' | 'n' | 'r' | 't';

const list = (s: string) =>
  s
    .split('-')
    .filter(Boolean)
    .map(Number)
    .filter((x) => Number.isFinite(x));

export function parseSide(s: string | null, def: SideSpec): SideSpec {
  if (!s) return def;
  const [u, civ, age, t, team] = s.split('.');
  const uid = Number(u);
  if (!Number.isFinite(uid) || !uid) return def;
  return {
    uid,
    civ: civ ?? '',
    age: Math.min(4, Math.max(1, Number(age) || 4)),
    ageSet: !!Number(age),
    techs: t === 'f' || t === 'c' ? t : list(t ?? ''),
    team: list(team ?? ''),
  };
}
export const fmtSide = (s: SideSpec) =>
  [s.uid, s.civ, s.ageSet === false ? '' : s.age, Array.isArray(s.techs) ? s.techs.join('-') : s.techs, s.team.join('-')].join('.');

/** 比较链接须完整且可验证；旧 PK 的宽松解析与回退规则保持不变。 */
export function parseUpgradeSide(raw: string | null, allowPreset = true): SideSpec | null {
  if (raw === null) return null;
  const parts = raw.split('.');
  if (parts.length !== 5) return null;
  const [uid, civ, age, techs, team] = parts as [string, string, string, string, string];
  const ids = /^(?:[1-9]\d*(?:-[1-9]\d*)*)?$/;
  const teams = /^(?:\d+(?:-\d+)*)?$/;
  if (!/^[1-9]\d*$/.test(uid) || !/^[A-Za-z]+$/.test(civ) || !/^[1-4]$/.test(age) || !teams.test(team)) return null;
  if (!ids.test(techs) && !(allowPreset && (techs === 'f' || techs === 'c'))) return null;
  // 此处不复用旧 list 的有限数过滤：溢出 ID 必须拒绝，不能被丢弃成空方案。
  const strictIds = (value: string) => (value === '' ? [] : value.split('-').map(Number));
  const result = { uid: +uid, civ, age: +age, ageSet: true, techs: techs === 'f' || techs === 'c' ? techs : strictIds(techs), team: strictIds(team) };
  return Number.isSafeInteger(result.uid) && [...(Array.isArray(result.techs) ? result.techs : []), ...result.team].every(Number.isSafeInteger)
    ? (result as SideSpec)
    : null;
}
