export function isAgeProgressionSupplement(route, sup) {
  return route?.presentation === 'age-progression' && sup?.mode === 'progression';
}

export function partitionableSupplementIndices(route) {
  const indices = [];
  for (const [index, sup] of (route?.supplements ?? []).entries()) {
    if (!isAgeProgressionSupplement(route, sup)) indices.push(index);
  }
  return indices;
}
