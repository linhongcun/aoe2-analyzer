export const AGE_BANDS: [string, number, number][] = [
  ['黑暗', 0, 1],
  ['封建时代', 1, 2],
  ['城堡时代', 3, 2],
  ['帝王时代', 5, 2],
];

/** 树格 row 从 1 开始，布局时代带从 0 开始；不是目录的通用 age。 */
export function treeAge(row: number): string {
  const band = AGE_BANDS.find(([, start, length]) => Number.isInteger(row) && row > start && row <= start + length);
  return band ? (band[0] === '黑暗' ? '黑暗时代' : band[0]) : '时代未核实';
}
