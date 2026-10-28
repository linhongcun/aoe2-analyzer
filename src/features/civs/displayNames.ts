import type { Core } from '../../data';
import { openingText } from '../../domain/civOpening';

/** 蜀详情的旧中文称呼跟随当前单位名，保留原本的英文说明。 */
export function civDisplayText(text: string, civ: string, core: Core | null): string {
  const guard = civ === 'Shu' && core?.unitById[1959];
  return guard ? text.split('白毦卫').join(guard.zh) : text;
}

/** 仅推荐路线将蜀的科技英文转为中文，不改独特科技的正常双语名称。 */
export function civOpeningDisplayText(text: string, civ: string, core: Core | null): string {
  if (!core) return text;
  const normalized = openingText(text, core.units);
  const magazine = civ === 'Shu' ? core.techById[1069] : undefined;
  return magazine?.en ? normalized.split(magazine.en).join(magazine.zh) : normalized;
}
