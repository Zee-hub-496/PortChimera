import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ThemeProvider, useTheme } from './components/ThemeProvider.jsx';
import { warmUpApi } from './lib/api.js';
import './index.css';

// Toasts follow the resolved theme, so this must sit inside ThemeProvider.
function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster richColors closeButton theme={resolved} />;
}

warmUpApi();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary variant="root">
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <ThemedToaster />
        </MotionConfig>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
