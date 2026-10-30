/** The historical calculator baseline predates S1's separately verified navigation. */
export function frozenDuelText(root: HTMLElement): string {
  const navigation = root.id === 'duel' ? root.querySelector<HTMLElement>(':scope > nav.ctx-bar[aria-label="对阵相关入口"]') : null;
  if (!navigation) return root.innerText;
  const style = navigation.getAttribute('style');
  try {
    // One synchronous read: retain rendered/hidden calculator text semantics and never
    // filter a matching string elsewhere in the calculator or alter historical fixtures.
    navigation.setAttribute('style', `${style ?? ''};display:none!important`);
    return root.innerText;
  } finally {
    if (style === null) navigation.removeAttribute('style');
    else navigation.setAttribute('style', style);
  }
}
