import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { fetchArtifactStats, fetchCredentials } from './api';

const ENVS = ['DEV', 'UAT', 'PROD'];

export default function AppLayout({ theme, toggleTheme, children }) {
  const [counts, setCounts] = useState({ artifacts: 0, credentials: 0 });

  useEffect(() => {
    Promise.all([
      fetchArtifactStats().catch(() => ({ total: 0 })),
      Promise.all(ENVS.map(e =>
        fetchCredentials(e).then(r => r.credentials || []).catch(() => [])
      )),
    ]).then(([stats, credResults]) => {
      const totalCreds = credResults.reduce((sum, arr) => sum + arr.length, 0);
      setCounts({ artifacts: stats.total || 0, credentials: totalCreds });
    }).catch(() => {});
  }, []);

  return (
    <div className="home-layout">
      <Sidebar theme={theme} toggleTheme={toggleTheme} counts={counts} />
      <main className="home-main">
        {children}
      </main>
    </div>
  );
}
