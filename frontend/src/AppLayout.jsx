import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { fetchCredentials } from './api';

const ENVS = ['DEV', 'UAT', 'PROD'];

export default function AppLayout({ theme, toggleTheme, children }) {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [sidebarOpen, setSidebarOpen] = useState(isHome);
  const [credCount, setCredCount] = useState(0);

  useEffect(() => {
    setSidebarOpen(isHome);
  }, [isHome]);

  useEffect(() => {
    Promise.all(ENVS.map(e =>
      fetchCredentials(e).then(r => r.credentials || []).catch(() => [])
    )).then(results => {
      setCredCount(results.reduce((sum, arr) => sum + arr.length, 0));
    }).catch(() => {});
  }, []);

  return (
    <div className="home-layout">
      <Sidebar theme={theme} toggleTheme={toggleTheme} open={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} counts={{ credentials: credCount }} />
      <main className="home-main">
        {children}
      </main>
    </div>
  );
}
