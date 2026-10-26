import type { BuildOrder, Source } from './buildOrder';
import type { GameGuideSource } from './gameGuide';

/** Strictly validated public fields; recognized technical locators are absent. */
export interface PublicBuildSource {
  title: string;
  url: string;
  author: string;
  section?: string;
  ref?: string;
  accessed: string;
}
export interface PublicBuildPresentation {
  sources: PublicBuildSource[];
  license: string;
}
export function publicBuildSources(sources: readonly Source[] | undefined | null): PublicBuildSource[];
export function publicBuildLicense(license: string, sources: readonly Source[] | undefined | null): string;
export function publicBuildPresentation(order: Pick<BuildOrder, 'sources' | 'license'>): PublicBuildPresentation;
export function publicGameGuideSources(sources: Readonly<Record<string, GameGuideSource>>): Record<string, GameGuideSource>;
