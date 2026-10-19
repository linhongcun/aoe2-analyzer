import releases from '../data/catalog-introductions.json';
import { dlcMatch } from './dlc';
import type { Tech } from './types';

/** 当前具名形态首发；不同目录的ID空间独立，未知条目不推断。 */
const units: Readonly<Record<number, number | null>> = releases.units;
const buildings: Readonly<Record<number, number | null>> = releases.buildings;
const techs: Readonly<Record<number, number | null>> = releases.techs;
const updates: Readonly<Record<number, string>> = releases.techUpdates;
export const unitDlc = ({ id }: { id: number }): number | null => units[id] ?? null;
export const buildingDlc = ({ id }: { id: number }): number | null => buildings[id] ?? null;
export const techDlc = ({ id }: { id: number }): number | null => techs[id] ?? null;
export const techUpdate = ({ id }: { id: number }): string | undefined => updates[id];

/** 免费更新是已核实的首发信息，不混入未标注或某个资料片。 */
export function techReleaseMatches(tech: Pick<Tech, 'dlc' | 'introducedUpdate'>, value: string): boolean {
  if (value === 'update') return !!tech.introducedUpdate;
  if (value === 'none') return tech.dlc === null && !tech.introducedUpdate;
  return dlcMatch(tech.dlc, value);
}
