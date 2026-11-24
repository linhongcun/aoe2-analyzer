import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { installPreloadErrorRecovery } from './shared/utils/chunkRecoveryBrowser';
import './shared/styles/tokens.css';
import './shared/styles/base.css';
import './shared/styles/layout.css';
import './shared/styles/editorial.css';
import './shared/styles/issue62-layout.css';
import './shared/styles/issue62-cards.css';
import './shared/styles/bonus-condition.css';

installPreloadErrorRecovery();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
