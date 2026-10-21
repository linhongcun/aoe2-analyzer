import type { Trees } from './types';

/** 某文明科技树中可用项目，键为 "u<id>" / "t<id>" */
export function civStatus(trees: Trees, civ: string): Record<string, number> {
  const s: Record<string, number> = {};
  (trees.t[civ] ?? []).forEach((b) =>
    b[3].forEach((c) => {
      s[c[2] + c[3]] = c[4];
    }),
  );
  return s;
}
