/** 开局模拟用的单位升级表（单位 id → [费用, 研究秒数]），列表与时间线共用这一份。 */
import { CORE } from '../../data/core';
import type { UpgradeData } from '../../domain/buildSim';

export const UPS = Object.fromEntries(CORE.units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
