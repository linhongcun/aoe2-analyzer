import { matchPath, parsePath, type Path } from 'react-router-dom';

/** A delayed normalization may only replace the same still-current Compare URL. */
export function compareLocationIsCurrent(snapshot: Path, browserHash: string): boolean {
  const current = parsePath(browserHash.slice(1));
  let currentPath = current.pathname ?? '/';
  // Match HashRouter's getHashLocation, including legacy #compare URLs.
  if (!currentPath.startsWith('/') && !currentPath.startsWith('.')) currentPath = '/' + currentPath;
  if (currentPath !== snapshot.pathname || (current.search ?? '') !== snapshot.search || (current.hash ?? '') !== snapshot.hash) return false;
  try {
    // Match React Router's decodePath: an encoded slash stays inside its segment.
    const decodedPath = snapshot.pathname
      .split('/')
      .map((segment) => decodeURIComponent(segment).replace(/\//g, '%2F'))
      .join('/');
    return matchPath('/compare', decodedPath) !== null;
  } catch {
    return false;
  }
}
