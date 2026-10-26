import { fmtSide, type SideSpec } from '../../../domain/duelState';
import { sharePageUrl } from '../../../domain/sharePage';

export interface BohemianPreset {
  key: string;
  title: string;
  a: SideSpec;
  b: SideSpec;
}

export const BOHEMIAN_DUEL_PRESETS: readonly BohemianPreset[] = [
  {
    key: 'castle-hussite-mangonel',
    title: '城堡时代：胡斯派战车对轻型投石车',
    a: { uid: 1704, civ: 'Bohemians', age: 3, techs: 'c', team: [] },
    b: { uid: 280, civ: 'Franks', age: 3, techs: 'c', team: [] },
  },
  {
    key: 'imperial-hussite-onager',
    title: '帝王时代：精锐胡斯派战车对中型投石车',
    a: { uid: 1706, civ: 'Bohemians', age: 4, techs: 'c', team: [] },
    b: { uid: 550, civ: 'Franks', age: 4, techs: 'c', team: [] },
  },
];

/** A newer data build needs a fresh preset review before these cards are shown. */
export const bohemianPresetsFor = (currentBuild: number): readonly BohemianPreset[] => (currentBuild === 185872 ? BOHEMIAN_DUEL_PRESETS : []);
const query = (preset: BohemianPreset) => new URLSearchParams({ a: fmtSide(preset.a), b: fmtSide(preset.b), m: '1' }).toString();
export const bohemianPresetPath = (preset: BohemianPreset) => '/duel?' + query(preset);
export const bohemianPresetShareUrl = (preset: BohemianPreset, projectBase: string) => sharePageUrl('/duel', query(preset), projectBase);
