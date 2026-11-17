import { HashRouter } from 'react-router-dom';
import { NavigationEntryProvider } from '../shared/utils/navigationEntry';
import { Layout } from './Layout';
import { AppRoutes } from './routes';

export default function App() {
  return (
    <HashRouter>
      <NavigationEntryProvider>
        <Layout>
          <AppRoutes />
        </Layout>
      </NavigationEntryProvider>
    </HashRouter>
  );
}
