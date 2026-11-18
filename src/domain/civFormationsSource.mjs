export function resolveFormationSource(defaultSource, route) {
  const source = route?.source ?? defaultSource;
  if (
    !source ||
    typeof source.content !== 'string' ||
    !source.content ||
    typeof source.discussion !== 'string' ||
    !source.discussion ||
    typeof source.boundary !== 'string' ||
    !source.boundary
  )
    return null;
  return source;
}
