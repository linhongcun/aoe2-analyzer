import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './shared/styles/tokens.css';
import './shared/styles/base.css';
import './shared/styles/layout.css';
import './shared/styles/editorial.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
