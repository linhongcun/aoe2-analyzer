/** Reusable primitives only; each caller keeps its own limits, messages and error order. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function textLength(value: string, unit: 'utf16' | 'code-points' = 'utf16'): number {
  return unit === 'code-points' ? Array.from(value).length : value.length;
}

export interface TextCharacterPolicy {
  multiline?: boolean;
  rejectUnpairedSurrogates?: boolean;
  rejectDirectionalMarks?: boolean;
}

/** Return the first invalid character's kind, preserving callers' existing diagnostic priority. */
export function textCharacterProblem(value: string, policy: TextCharacterPolicy = {}): 'unicode' | 'control' | null {
  for (const char of value) {
    const cp = char.codePointAt(0)!;
    if (policy.rejectUnpairedSurrogates && cp >= 0xd800 && cp <= 0xdfff) return 'unicode';
    if (
      (cp < 32 && !(policy.multiline && [9, 10, 13].includes(cp))) ||
      (cp >= 127 && cp <= 159) ||
      (cp >= 0x202a && cp <= 0x202e) ||
      (cp >= 0x2066 && cp <= 0x2069) ||
      (policy.rejectDirectionalMarks && [0x061c, 0x200e, 0x200f].includes(cp))
    )
      return 'control';
  }
  return null;
}

/** Clock grammar only: empty values and recoverable semantic errors remain caller decisions. */
export function isClockText(value: string, limits: { minuteDigits: number; hourDigits: number }): boolean {
  return new RegExp(`^(?:\\d{1,${limits.minuteDigits}}:[0-5]\\d|\\d{1,${limits.hourDigits}}:[0-5]\\d:[0-5]\\d)$`).test(value);
}
