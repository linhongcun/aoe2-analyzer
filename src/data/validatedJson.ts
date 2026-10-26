export interface JsonValidator<T> {
  (value: unknown): value is T;
  errors?: readonly { instancePath?: string; message?: string }[] | null;
}

/** Standalone validators are pure checks: no coercion, defaults or field removal. */
export function readValidatedJson<T>(value: unknown, validate: JsonValidator<T>, label: string): T {
  if (!validate(value)) {
    const first = validate.errors?.[0];
    throw new Error(`数据校验失败（${label}）：${first?.instancePath || '/'} ${first?.message ?? ''}`);
  }
  return value;
}
