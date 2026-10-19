import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { civs } from '../data';
import Home from '../features/home/components/Home';

// 非首页路由按需拆包
const CivList = lazy(() => import('../features/civs/components/CivList'));
const CivDetail = lazy(() => import('../features/civs/components/CivDetail'));
const BuildOrderList = lazy(() => import('../features/builds/BuildOrderList'));
const Patches = lazy(() => import('../features/patches/Patches'));
const AboutData = lazy(() => import('../features/about/AboutData'));
const UnitList = lazy(() => import('../features/units/components/UnitList'));
const UnitDetail = lazy(() => import('../features/units/components/UnitDetail'));
const TechList = lazy(() => import('../features/techs/components/TechList'));
const TechDetail = lazy(() => import('../features/techs/components/TechDetail'));
const TreeView = lazy(() => import('../features/tree/components/TreeView'));
const DlcView = lazy(() => import('../features/dlc/components/DlcView'));
const Compare = lazy(() => import('../features/compare/components/Compare'));
const BuildingList = lazy(() => import('../features/buildings/components/BuildingList'));
const BuildingDetail = lazy(() => import('../features/buildings/components/BuildingDetail'));
const SimulatorHub = lazy(() => import('../features/simulator/components/SimulatorHub'));
const Maps = lazy(() => import('../features/maps/Maps'));
const Planned = lazy(() => import('../features/placeholder/components/Planned'));
const Duel = lazy(() => import('../features/duel/components/Duel'));
const BonusDetail = lazy(() => import('../features/bonuses/components/BonusDetail'));
const BonusList = lazy(() => import('../features/bonuses/components/BonusList'));
const Matchup = lazy(() => import('../features/matchup/components/Matchup'));
const Market = lazy(() => import('../features/market/Market'));
const Production = lazy(() => import('../features/production/Production'));
const EcoPayoff = lazy(() => import('../features/ecoPayoff/EcoPayoff'));

/** 兼容旧版所有 hash 路由：#civ/X #unit/id/... #tech/id #tree/X #dlc #units #techs #compare #matchup #list→#civs */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/civs" element={<CivList />} />
      <Route path="/list" element={<Navigate to="/civs" replace />} />
      <Route path="/civ/:en" element={<CivDetail />} />
      <Route path="/civ/:en/bonus/:idx" element={<BonusDetail />} />
      <Route path="/bonuses" element={<BonusList />} />
      <Route path="/units" element={<UnitList />} />
      <Route path="/unit/*" element={<UnitDetail />} />
      <Route path="/techs" element={<TechList />} />
      <Route path="/tech/:id" element={<TechDetail />} />
      <Route path="/tree" element={<Navigate to={'/tree/' + civs[16]!.en} replace />} />
      <Route path="/tree/:civ" element={<TreeView />} />
      <Route path="/dlc" element={<DlcView />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/matchup" element={<Matchup />} />
      <Route path="/buildings" element={<BuildingList />} />
      <Route path="/building/:id" element={<BuildingDetail />} />
      <Route path="/duel" element={<Duel />} />
      <Route path="/production" element={<Production />} />
      <Route path="/eco-payoff" element={<EcoPayoff />} />
      <Route path="/market" element={<Market />} />
      <Route path="/patches" element={<Patches />} />
      <Route path="/patches/:id" element={<Patches />} />
      <Route path="/about-data" element={<AboutData />} />
      <Route path="/simulator" element={<SimulatorHub />} />
      <Route path="/builds" element={<BuildOrderList />} />
      <Route path="/maps" element={<Maps />} />
      {['/ladder'].map((p) => (
        <Route key={p} path={p} element={<Planned />} />
      ))}
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
