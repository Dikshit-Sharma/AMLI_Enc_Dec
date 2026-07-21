import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { logAnalyticsEvent } from './firebase';
import './App.css';
import SmartTextArea from './SmartTextArea';
import HomePage from './HomePage';
import ArtifactsPage from './ArtifactsPage';
import CipherTool from './CipherTool';
import LibraryPage from './LibraryPage';
import CredentialsPage from './CredentialsPage';
import HotkeyHelp from './HotkeyHelp';
import useHotkeys from './hooks/useHotkeys';
import OnboardingBot from './OnboardingBot';
import QuickAnswerBot from './QuickAnswerBot';
import CommandPalette from './CommandPalette';
import JenkinsPage from './JenkinsPage';

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showCmdPalette, setShowCmdPalette] = useState(false);

  const location = useLocation();

  useHotkeys({
    onToggleHelp: () => setShowHotkeys((p) => !p),
    onEscape: () => setShowHotkeys(false),
  });

  React.useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCmdPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  React.useEffect(() => {
    const isCipherPage = location.pathname === '/cipher';
    if (isCipherPage) {
      document.body.classList.add('layout-fixed');
    } else {
      document.body.classList.remove('layout-fixed');
    }
    return () => document.body.classList.remove('layout-fixed');
  }, [location.pathname]);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
    logAnalyticsEvent('theme_toggle', { theme: theme === 'light' ? 'dark' : 'light' });
  };

  return (
    <>
      <OnboardingBot />
      <QuickAnswerBot />
      <Routes>
      <Route path="/" element={<HomePage theme={theme} toggleTheme={toggleTheme} />} />
      <Route path="/artifacts" element={<ArtifactsPage theme={theme} toggleTheme={toggleTheme} />} />
      <Route path="/library" element={<LibraryPage theme={theme} toggleTheme={toggleTheme} />} />
      <Route path="/credentials" element={<CredentialsPage theme={theme} toggleTheme={toggleTheme} />} />

      <Route path="/cipher" element={<CipherTool theme={theme} toggleTheme={toggleTheme} />} />
      <Route path="/jenkins" element={<JenkinsPage theme={theme} toggleTheme={toggleTheme} />} />
    </Routes>

    <CommandPalette open={showCmdPalette} onClose={() => setShowCmdPalette(false)} />
    {showHotkeys && <HotkeyHelp onClose={() => setShowHotkeys(false)} />}
    </>
  );
}

export default App;
