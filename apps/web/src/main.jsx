import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import App from './App.jsx';
import { ThemeProvider, useTheme } from './components/ThemeProvider.jsx';
import './index.css';

// Toasts follow the resolved theme, so this must sit inside ThemeProvider.
function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster richColors closeButton theme={resolved} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <ThemedToaster />
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
);
