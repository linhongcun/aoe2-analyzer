import { siegeUnitEntryVerified, SIEGE_UNIT_IDS } from '../../domain/siege';
import type { Building, Unit } from '../../domain/types';

/** 资料页只承诺工具能原样接受、且缺省结果已核实的单位链接。 */
export function unitSiegeHref(unit: Unit, castle: Building | undefined): string | null {
  return SIEGE_UNIT_IDS.includes(unit.id) && siegeUnitEntryVerified(unit, castle) ? `/siege?unit=${unit.id}` : null;
}
