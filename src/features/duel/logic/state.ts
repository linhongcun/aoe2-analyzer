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
export type Mode = '1' | 'n' | 'r';

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
