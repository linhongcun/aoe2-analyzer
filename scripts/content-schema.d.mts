export interface JsonProblem {
  file: string;
  path: string;
  code: string;
  keyword: string;
  message: string;
  schemaPath?: string;
  params?: Record<string, unknown>;
  valueSha256?: string;
}
export interface LegacySourceEntry {
  file: string;
  path: string;
  format: string;
  valueSha256: string;
}
export const LEGACY_SOURCE_BASELINE: readonly Readonly<LegacySourceEntry>[];
export const SCHEMA_DIRECTORY: string;
export const SCHEMA_ID_BASE: string;
export function schemaFileFor(file: string): string | null;
export function validateDocument(file: string, data: unknown): { valid: boolean; problems: JsonProblem[] };
export function checkDirectory(root?: string): { files: string[]; problems: JsonProblem[] };
export function ratchetProblems(problems: readonly JsonProblem[], baseline?: readonly LegacySourceEntry[]): { warnings: JsonProblem[]; errors: JsonProblem[] };
export function createSchemaCompiler(options?: { standalone?: boolean; schemaFiles?: string[] }): import('ajv').default;
