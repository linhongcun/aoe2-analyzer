export interface FormationSource {
  content: string;
  discussion: string;
  boundary: string;
}

export function resolveFormationSource(defaultSource: FormationSource | undefined, route: { source?: FormationSource } | undefined): FormationSource | null;
