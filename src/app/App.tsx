import { HashRouter } from 'react-router-dom';
import { Layout } from './Layout';
import { AppRoutes } from './routes';

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <AppRoutes />
      </Layout>
    </HashRouter>
  );
}
