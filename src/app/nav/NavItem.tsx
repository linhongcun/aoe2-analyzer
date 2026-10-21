import { NavLink } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import type { Section } from '../../shared/nav/sections';

export function NavItem({ s, path }: { s: Section; path: string }) {
  return (
    <NavLink to={s.path} className={() => `nitem${s.match.test(path) ? ' on' : ''}`} data-t={s.key}>
      <Icon name={s.icon} />
      {s.label}
    </NavLink>
  );
}
