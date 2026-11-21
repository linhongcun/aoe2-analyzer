import { contactFight, type ContactResult } from './contactFight';

export { contactFighterError as mixedFighterError } from './contactFight';
export type { ArmyRow as MixedFighter, ArmyResult as MixedArmyResult } from './contactFight';

export const MIXED_RULE = 'frontline-v2';
export const LEGACY_MIXED_RULE = 'queue-v1';
export const MIXED_RULE_LABEL = '接触面与接敌先手 v2';
export type MixedFightResult = ContactResult;
export const mixedFight = contactFight;
