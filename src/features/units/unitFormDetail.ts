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
          from_: null,
          up: null,
          rngBd: undefined,
          accuracyDispersion: undefined,
          attackDelaySeconds: alternate.attackDelaySeconds,
          frameDelay: alternate.frameDelay,
          garrisonCapacity: alternate.garrisonCapacity,
          blastDamage: undefined,
          blastAttackLevel: undefined,
          friendlyFireDamage: undefined,
        }
      : catalogTarget;
  return { owner, alternate, rawTarget };
}
