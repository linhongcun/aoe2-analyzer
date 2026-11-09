export const REQUIRED_ENTRIES: readonly string[];
export const FORBIDDEN_PHRASES: readonly string[];
export function checkDesignIndex(options?: {
  root?: string;
  readmePath?: string;
  requiredEntries?: readonly string[];
  forbidden?: readonly string[];
}): string[];
