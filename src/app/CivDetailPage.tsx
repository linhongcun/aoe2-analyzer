import { lazy } from 'react';
import CivDetail from '../features/civs/components/CivDetail';

const TechTree = lazy(() => import('../features/tree/components/CivTechTree'));

/** 树的模块从 app 懒加载，文明详情不直接引用 features/tree。 */
export default function CivDetailPage() {
  return <CivDetail techTree={TechTree} />;
}
