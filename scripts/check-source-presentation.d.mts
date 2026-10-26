import type { JsonProblem } from './content-schema.mjs';
export function validateSourcePresentation(file: string, data: unknown): { valid: boolean; problems: JsonProblem[] };
export function checkSourcePresentation(root?: string): { files: string[]; problems: JsonProblem[] };
export function main(args?: string[]): number;
