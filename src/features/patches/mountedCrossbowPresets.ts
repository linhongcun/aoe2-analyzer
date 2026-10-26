import { fmtSide, type SideSpec } from '../../domain/duelState';
import { sharePageUrl } from '../../domain/sharePage';

export interface MountedCrossbowPreset {
  key: string;
  title: string;
  a: SideSpec;
  b: SideSpec;
  note?: string;
}

export const MOUNTED_CROSSBOW_PRESETS: readonly MountedCrossbowPreset[] = [
  {
    key: 'castle-britons-byzantines',
    title: '城堡时代：不列颠骑马弩兵与拜占庭骑射手',
    a: { uid: 2700, civ: 'Britons', age: 3, techs: [], team: [] },
    b: { uid: 39, civ: 'Byzantines', age: 3, techs: [], team: [] },
  },
  {
    key: 'castle-franks-byzantines',
    title: '城堡时代：法兰克骑马弩兵与拜占庭骑射手',
    a: { uid: 2700, civ: 'Franks', age: 3, techs: [], team: [] },
    b: { uid: 39, civ: 'Byzantines', age: 3, techs: [], team: [] },
    note: '王家敕令骑兵折扣未计入。',
  },
  {
    key: 'imperial-britons-byzantines',
    title: '帝王时代：不列颠重装骑马弩兵与拜占庭重装骑射手',
    a: { uid: 2701, civ: 'Britons', age: 4, techs: [], team: [] },
    b: { uid: 474, civ: 'Byzantines', age: 4, techs: [], team: [] },
  },
];

export function mountedCrossbowPresetsFor(patchId: string | undefined, currentBuild: number): readonly MountedCrossbowPreset[] {
  return patchId === '185872' && currentBuild === 185872 ? MOUNTED_CROSSBOW_PRESETS : [];
}

const query = (preset: MountedCrossbowPreset) => new URLSearchParams({ a: fmtSide(preset.a), b: fmtSide(preset.b), m: '1' }).toString();

export const duelPresetPath = (preset: MountedCrossbowPreset) => `/duel?${query(preset)}`;
export const duelPresetShareUrl = (preset: MountedCrossbowPreset, projectBase: string) => sharePageUrl('/duel', query(preset), projectBase);
