export function isAgeProgressionSupplement(route: { presentation?: string } | undefined, sup: { mode?: string } | undefined): boolean;

export function partitionableSupplementIndices(route: { presentation?: string; supplements?: readonly { mode?: string }[] } | undefined): number[];
