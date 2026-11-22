import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '../shared/ui/ErrorRecovery';
import { NavigationEntryProvider } from '../shared/utils/navigationEntry';
import { Layout } from './Layout';
import { AppRoutes } from './routes';

function RoutedShell() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <Layout>
      <ErrorBoundary shell="route" resetKey={`${pathname}${search}`} onGoHome={() => navigate('/')}>
        <AppRoutes />
      </ErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary shell="standalone">
      <HashRouter>
        <NavigationEntryProvider>
          <RoutedShell />
        </NavigationEntryProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
