export const FORMATIONS_FILE: string;
export const FORMATION_CONTRACT_FILE: string;

export interface FormationProblem {
  path: string;
  message: string;
}

export interface FormationCatalogIds {
  unit: ReadonlySet<number>;
  building: ReadonlySet<number>;
  tech: ReadonlySet<number>;
}

export function formationProblems(content: unknown, contract: unknown, catalogIds?: FormationCatalogIds): FormationProblem[];
