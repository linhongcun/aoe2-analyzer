export function isPublicSourceUrl(value: unknown): boolean;
export function isPublicSourceText(value: unknown): boolean;
export const publicFormats: Record<string, { type: 'string'; validate: (value: unknown) => boolean }>;
export function constructionReferenceProblems(value: unknown): { path: string; message: string }[];
