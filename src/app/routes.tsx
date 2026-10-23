import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { civs } from '../data';
import { PAGE_REGISTRY, type RegisteredPage } from './pageRegistry';

const PageMeta = lazy(() => import('../features/share/PageMeta'));
const NotFound = lazy(() => import('../features/notFound/NotFound'));

/** 元数据跟随登记表里的路由 pattern，不看地址栏里的大小写或编码。 */
function RegisteredRoute({ page }: { page: RegisteredPage }) {
  if (page.redirectDefaultTree) return <Navigate to={'/tree/' + civs[16]!.en} replace />;
  if (page.redirectTo) return <Navigate to={page.redirectTo} replace />;
  const Page = page.Component;
  if (!Page) return null;
  return (
    <>
      <Page />
      <Suspense fallback={null}>
        <PageMeta pattern={page.path} omitShareSearch={page.omitShareSearch === true} />
      </Suspense>
    </>
  );
}

/** 兼容旧版所有 hash 路由：#civ/X #unit/id/... #tech/id #tree/X #dlc #units #techs #compare #matchup #list→#civs */
export function AppRoutes() {
  return (
    <Routes>
      {PAGE_REGISTRY.map((page) => (
        <Route key={page.path} path={page.path} element={<RegisteredRoute page={page} />} />
      ))}
      <Route
        path="*"
        element={
          <>
            <NotFound />
            <Suspense fallback={null}>
              <PageMeta notFound />
            </Suspense>
          </>
        }
      />
    </Routes>
  );
}
