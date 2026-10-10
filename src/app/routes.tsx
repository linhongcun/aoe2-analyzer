import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import CivList from '../features/civs/components/CivList';
import CivDetail from '../features/civs/components/CivDetail';
import { civs } from '../data';

// 非首页路由按需拆包
const UnitList = lazy(() => import('../features/units/components/UnitList'));
const UnitDetail = lazy(() => import('../features/units/components/UnitDetail'));
const TechList = lazy(() => import('../features/techs/components/TechList'));
const TechDetail = lazy(() => import('../features/techs/components/TechDetail'));
const TreeView = lazy(() => import('../features/tree/components/TreeView'));
const DlcView = lazy(() => import('../features/dlc/components/DlcView'));
const Compare = lazy(() => import('../features/compare/components/Compare'));
const Matchup = lazy(() => import('../features/matchup/components/Matchup'));

/** 兼容旧版所有 hash 路由：#civ/X #unit/id/... #tech/id #tree/X #dlc #units #techs #compare #matchup #list */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<CivList />} />
      <Route path="/list" element={<CivList />} />
      <Route path="/civ/:en" element={<CivDetail />} />
      <Route path="/units" element={<UnitList />} />
      <Route path="/unit/*" element={<UnitDetail />} />
      <Route path="/techs" element={<TechList />} />
      <Route path="/tech/:id" element={<TechDetail />} />
      <Route path="/tree" element={<Navigate to={'/tree/' + civs[16]!.en} replace />} />
      <Route path="/tree/:civ" element={<TreeView />} />
      <Route path="/dlc" element={<DlcView />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/matchup" element={<Matchup />} />
      <Route path="*" element={<CivList />} />
    </Routes>
  );
}
