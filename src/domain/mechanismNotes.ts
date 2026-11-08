import * as armenian from './armenianEconomy';
import * as bengali from './bengaliEconomy';
import * as buildSimCivRules from './buildSimCivRules';
import * as buildSimNotes from './buildSimNotes';
import * as chinese from './chineseEconomy';
import * as duel from './duel';
import * as georgian from './georgianEconomy';
import * as gurjara from './gurjaraEconomy';
import * as jurchen from './jurchenEconomy';
import * as khmer from './khmerEconomy';
import * as mapuche from './mapucheEconomy';
import * as polish from './polishEconomy';
import * as roman from './romanEconomy';
import * as siege from './siege';
import * as slavic from './slavicEconomy';
import * as wei from './weiEconomy';

export type NoteStatus = 'verified' | 'unverified' | 'assumption';
export interface SimNote {
  id: string;
  civ?: string;
  scope: string;
  status: NoteStatus;
  text: string;
}

type ModuleEntry = { name: string; module: Record<string, unknown>; civ?: string };
const MODULES: readonly ModuleEntry[] = [
  { name: 'armenianEconomy', module: armenian, civ: 'Armenians' },
  { name: 'bengaliEconomy', module: bengali, civ: 'Bengalis' },
  { name: 'chineseEconomy', module: chinese, civ: 'Chinese' },
  { name: 'georgianEconomy', module: georgian, civ: 'Georgians' },
  { name: 'gurjaraEconomy', module: gurjara, civ: 'Gurjaras' },
  { name: 'jurchenEconomy', module: jurchen, civ: 'Jurchens' },
  { name: 'khmerEconomy', module: khmer, civ: 'Khmer' },
  { name: 'mapucheEconomy', module: mapuche, civ: 'Mapuche' },
  { name: 'polishEconomy', module: polish, civ: 'Poles' },
  { name: 'romanEconomy', module: roman, civ: 'Romans' },
  { name: 'slavicEconomy', module: slavic, civ: 'Slavs' },
  { name: 'weiEconomy', module: wei, civ: 'Wei' },
  { name: 'buildSimCivRules', module: buildSimCivRules },
  { name: 'buildSimNotes', module: buildSimNotes },
  { name: 'duel', module: duel },
  { name: 'siege', module: siege },
];

const NOTE_EXPORT = /^[A-Z0-9_]+_(NOTE|REASON|ASSUMPTION|DETAIL)$/;
const uncertainty = /未核实|未确认|待确认|未实测|未验证|待补/;
const seen = new Map<string, number>();

const statusFor = (name: string, text: string): NoteStatus => (uncertainty.test(text) || name.endsWith('_REASON') ? 'unverified' : 'assumption');
const scopeFor = (moduleName: string): string =>
  moduleName.endsWith('Economy') || moduleName === 'buildSimCivRules' || moduleName === 'buildSimNotes' ? 'build-sim' : 'ui';

/** 所有导出的 *_NOTE / *_REASON / *_ASSUMPTION / *_DETAIL 常量的只读注册表（issue 800）。 */
export const SIM_NOTE_LIST: readonly SimNote[] = MODULES.flatMap(({ name, module, civ }) =>
  Object.entries(module).flatMap(([key, value]) => {
    if (typeof value !== 'string' || !NOTE_EXPORT.test(key)) return [];
    let id = key.toLowerCase().replace(/_/g, '-');
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count) id = `${name.toLowerCase()}-${id}`;
    return [{ id, ...(civ ? { civ } : {}), scope: scopeFor(name), status: statusFor(key, value), text: value }];
  }),
);

export const SIM_NOTES: Readonly<Record<string, SimNote>> = Object.fromEntries(SIM_NOTE_LIST.map((note) => [note.id, note]));
