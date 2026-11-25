import type { Core } from '../../data';

export function resolveUnitForm(core: Core | null, id: number | undefined) {
  const catalogTarget = core && id !== undefined ? core.unitById[id] : undefined;
  const formOwner = !catalogTarget && id !== undefined ? core?.units.find((unit) => unit.form?.id === id) : undefined;
  const owner = formOwner ?? catalogTarget;
  const alternate = formOwner?.form;
  const rawTarget =
    formOwner && alternate
      ? {
          ...formOwner,
          ...alternate,
          form: undefined,
          conversionResistance: undefined,
          bengaliConversion: undefined,
          casterTasks: undefined,
          from_: null,
          up: null,
          rngBd: undefined,
          accuracyDispersion: undefined,
          displayedReloadTime: undefined,
          attackDelaySeconds: alternate.attackDelaySeconds,
          frameDelay: alternate.frameDelay,
          garrisonCapacity: alternate.garrisonCapacity,
          combatAbility: alternate.combatAbility,
          blastDamage: undefined,
          blastAttackLevel: undefined,
          friendlyFireDamage: undefined,
          totalProjectiles: undefined,
          chargeMultiProjectiles: undefined,
          projectilePassThrough: undefined,
          onHitEffect: undefined,
          damagedTargetBonus: undefined,
          lowHpTransform: undefined,
          deathHealAura: undefined,
          trainCount: undefined,
        }
      : catalogTarget;
  return { owner, alternate, rawTarget };
}
