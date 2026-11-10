export interface AvailabilitySite {
  key: string;
  kind: string;
  owner: string;
  usedBy: string[];
}

export interface AvailabilityDeclaration {
  site: string;
  role: string;
  differs: readonly string[];
  because: string;
}

export function auditSources(
  entries: { name: string; text: string }[],
  declarations: AvailabilityDeclaration[],
): { sites: AvailabilitySite[]; errors: string[] };

export function checkRepo(root?: string): {
  sites: AvailabilitySite[];
  exceptions: AvailabilityDeclaration[];
  questions: { id: string; asks?: string; definedIn?: string; exportName?: string; consumer?: string }[];
  errors: string[];
};

export function contractErrors(text: string): string[];
export function displayForbiddenArea(file: string): string | null;
export function matchErrors(sites: AvailabilitySite[], declarations: AvailabilityDeclaration[]): string[];
