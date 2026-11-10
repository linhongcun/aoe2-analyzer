import type { Trees } from './types';

/** 某文明科技树中可用项目，键为 "u<id>" / "t<id>"。只问格子是否点亮，不代替 techAvailable、productionTechs、simTechs。手写例外见 techAvailability.ts。 */
export function civStatus(trees: Trees, civ: string): Record<string, number> {
  const s: Record<string, number> = {};
  (trees.t[civ] ?? []).forEach((b) =>
    b[3].forEach((c) => {
      s[c[2] + c[3]] = c[4];
    }),
  );
  return s;
}
