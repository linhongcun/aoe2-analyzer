/** 界面图标统一入口：仅使用 Lucide（ISC），禁止 emoji / Unicode 符号作图标（见 CONTRIBUTING.md） */
import { ArrowLeft, ArrowRight, ChevronRight, FlaskConical, Search, Swords, TreeDeciduous, TriangleAlert, type LucideIcon } from 'lucide-react';

const ICONS = {
  swords: Swords,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'chevron-right': ChevronRight,
  'tree-deciduous': TreeDeciduous,
  'flask-conical': FlaskConical,
  'triangle-alert': TriangleAlert,
  search: Search,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'ic' }: { name: IconName; className?: string }) {
  const C = ICONS[name];
  return <C className={className} aria-hidden="true" strokeWidth={2} />;
}
