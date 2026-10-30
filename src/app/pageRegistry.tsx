import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import Home from '../features/home/components/Home';
import { PAGES, type LazyComponentId, type PageDef } from '../shared/nav/pageRegistry';

const LOADERS: Record<LazyComponentId, LazyExoticComponent<ComponentType>> = {
  CivList: lazy(() => import('../features/civs/components/CivList')),
  CivDetail: lazy(() => import('../features/civs/components/CivDetail')),
  BonusDetail: lazy(() => import('../features/bonuses/components/BonusDetail')),
  BonusList: lazy(() => import('../features/bonuses/components/BonusList')),
  UnitList: lazy(() => import('../features/units/components/UnitList')),
  UnitDetail: lazy(() => import('../features/units/components/UnitDetail')),
  TechList: lazy(() => import('../features/techs/components/TechList')),
  TechDetail: lazy(() => import('../features/techs/components/TechDetail')),
  TreeView: lazy(() => import('../features/tree/components/TreeView')),
  DlcView: lazy(() => import('../features/dlc/components/DlcView')),
  Compare: lazy(() => import('../features/compare/components/Compare')),
  Matchup: lazy(() => import('../features/matchup/components/Matchup')),
  BuildingList: lazy(() => import('../features/buildings/components/BuildingList')),
  BuildingDetail: lazy(() => import('../features/buildings/components/BuildingDetail')),
  Duel: lazy(() => import('../features/duel/components/Duel')),
  Siege: lazy(() => import('../features/siege/Siege')),
  Production: lazy(() => import('../features/production/Production')),
  EcoPayoff: lazy(() => import('../features/ecoPayoff/EcoPayoff')),
  Market: lazy(() => import('../features/market/Market')),
  TradeIncome: lazy(() => import('../features/tradeIncome/TradeIncome')),
  Construction: lazy(() => import('../features/construction/Construction')),
  TeamBonuses: lazy(() => import('../features/teamBonuses/TeamBonuses')),
  GarrisonHealing: lazy(() => import('../features/garrisonHealing/GarrisonHealing')),
  GameClock: lazy(() => import('../features/gameClock/GameClock')),
  Hotkeys: lazy(() => import('../features/hotkeys/Hotkeys')),
  CastleDefense: lazy(() => import('../features/castleDefense/CastleDefense')),
  ContentGuide: lazy(() => import('../features/contentGuide/ContentGuide')),
  MixedArmy: lazy(() => import('../features/mixedArmy/MixedArmy')),
  TeamPlan: lazy(() => import('../features/teamPlan/TeamPlan')),
  Campaigns: lazy(() => import('../features/campaigns/Campaigns')),
  RelicIncome: lazy(() => import('../features/relicIncome/RelicIncome')),
  GameGuide: lazy(() => import('../features/gameGuide/GameGuide')),
  MatchReview: lazy(() => import('../features/matchReview/MatchReview')),
  Scouting: lazy(() => import('../features/scouting/Scouting')),
  Glossary: lazy(() => import('../features/glossary/Glossary')),
  Patches: lazy(() => import('../features/patches/Patches')),
  AboutData: lazy(() => import('../features/about/AboutData')),
  SimulatorHub: lazy(() => import('../features/simulator/components/SimulatorHub')),
  BuildOrderList: lazy(() => import('../features/builds/BuildOrderList')),
  Maps: lazy(() => import('../features/maps/Maps')),
  Players: lazy(() => import('../features/players/Players')),
  Events: lazy(() => import('../features/events/Events')),
  PlayerDetail: lazy(() => import('../features/players/PlayerDetail')),
  Planned: lazy(() => import('../features/placeholder/components/Planned')),
};

export interface RegisteredPage extends PageDef {
  /** 首页同步打进入口包；其余页面按登记表懒加载。重定向没有组件。 */
  Component?: ComponentType | LazyExoticComponent<ComponentType>;
}

export const PAGE_REGISTRY: readonly RegisteredPage[] = PAGES.map((page) => {
  if (page.component === 'Home') return { ...page, Component: Home };
  if (page.component) return { ...page, Component: LOADERS[page.component] };
  return page;
});
