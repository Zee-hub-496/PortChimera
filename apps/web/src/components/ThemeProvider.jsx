import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { THEME_KEY, normalizeChoice, resolveTheme } from '../lib/theme.js';

const ThemeContext = createContext({ choice: 'system', resolved: 'light', setChoice: () => {} });

const QUERY = '(prefers-color-scheme: dark)';

function readChoice() {
  try {
    return normalizeChoice(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

const systemPrefersDark = () => typeof matchMedia === 'function' && matchMedia(QUERY).matches;

// Holds the Light / Dark / System choice, saves it, and toggles the `dark` class on <html>.
export function ThemeProvider({ children }) {
  const [choice, setChoiceState] = useState(readChoice);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const mq = matchMedia(QUERY);
    const onChange = (e) => setPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(choice, prefersDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setChoice = useCallback((next) => {
    const value = normalizeChoice(next);
    setChoiceState(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      // Storage can be blocked. The choice still applies for this visit.
    }
  }, []);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
