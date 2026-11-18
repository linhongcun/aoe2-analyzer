export function assertDefinedProperties<T, K extends keyof T>(value: T, ...keys: K[]): asserts value is T & Required<Pick<T, K>> {
  for (const key of keys) {
    if (value[key] === undefined) throw new Error(`Expected ${String(key)} in formation fixture`);
  }
}

export function optionalEntityAge(entity: object): number | undefined {
  if (!('age' in entity) || typeof entity.age !== 'number') return undefined;
  return entity.age;
}
