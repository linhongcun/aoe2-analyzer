import releases from '../data/catalog-introductions.json';

/** 当前具名形态首发；不同目录的ID空间独立，未知条目不推断。 */
const units: Readonly<Record<number, number | null>> = releases.units;
const buildings: Readonly<Record<number, number | null>> = releases.buildings;
export const unitDlc = ({ id }: { id: number }): number | null => units[id] ?? null;
export const buildingDlc = ({ id }: { id: number }): number | null => buildings[id] ?? null;
