export const MARKDOWN_HOMES: readonly string[];
export const ROOT_MARKDOWN: readonly string[];
export const READABLE: readonly string[];
export const READERS: Readonly<Record<string, string>>;
export function misplaced(files: readonly string[]): string[];
export function markdownReads(path: string, source: string): string[];
export function checkDocsBoundary(options?: { root?: string; files?: readonly string[]; read?: (path: string) => string }): string[];
