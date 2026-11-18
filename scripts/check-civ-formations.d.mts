export const FORMATIONS_FILE: string;
export const FORMATION_CONTRACT_FILE: string;

export interface FormationProblem {
  path: string;
  message: string;
}

export function formationProblems(content: unknown, contract: unknown): FormationProblem[];
