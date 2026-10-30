import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../../src/shared/ui/Icon';
import type { ProductionConfig, ProductionContext } from '../../../src/domain/production';
import type { EcoPayoffConfig } from '../../../src/domain/ecoPayoff';
import type { State, View } from './state';
import type { Model } from './model';
export type ViewProps = {
  ctx: ProductionContext;
  state: State;
  model: Model;
  write: (state: State, push?: boolean) => void;
  stageLink: (view: View, children: ReactNode, className?: string) => ReactNode;
  updateConfig: (patch: Partial<ProductionConfig>) => void;
  updatePayoff: (patch: Partial<EcoPayoffConfig>) => void;
  applyTheory: () => void;
};
export const num = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
export const clock = (seconds: number) => {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
};
export const productHref = (path: string) => '/#' + path;
export const Avatar = ({ civ }: { civ: string }) => <img className="civ-art" alt="" src={`/img/civs/${civ.toLowerCase()}.webp`} />;
export const Go = () => <Icon name="arrow-right" />;
export function Notice({ children, icon = 'info' }: { children: ReactNode; icon?: IconName }) {
  return (
    <div className="notice">
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}
