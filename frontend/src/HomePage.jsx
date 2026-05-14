import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchArtifacts, toDate } from './api';
import { SkeletonStatCard, SkeletonRecentCard, SkeletonChart } from './Skeleton';

function EnvBarChart({ data }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="chart-container">
      <h3 className="chart-title">Environment Distribution</h3>
      <div className="chart-bars">
        {data.map((d) => (
          <div key={d.label} className="chart-bar-col">
            <div className="chart-bar-label-top">{d.value}</div>
            <div
              className="chart-bar"
              style={{ height: `${(d.value / max) * 100}%` }}
            >
              <div className="chart-bar-fill" />
            </div>
            <div className="chart-bar-label">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TOOLS = [
  { path: '/cipher', icon: '🔐', name: 'Cipher Tool', desc: 'AES encryption/decryption with GCM and CBC modes.' },
  { path: '/artifacts', icon: '💎', name: 'Artifacts', desc: 'Generate structured documentation packages and ZIP archives.' },
  { path: '/library', icon: '📚', name: 'API Library', desc: 'Browse, search, and re-download past artifact configurations.' },
  { path: '/credentials', icon: '🔑', name: 'Credentials', desc: 'Manage secrets for DEV, UAT, and PROD environments.' },
  { href: 'https://sharedclip.netlify.app/', icon: '📋', name: 'SharedClip', desc: 'Real-time collaborative clipboard for teams.', external: true },
];

export default function HomePage({ theme, toggleTheme }) {
  const [recent, setRecent] = useState([]);
  const [envData, setEnvData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchArtifacts().then((res) => {
      const arts = res.artifacts || [];
      setRecent(arts.slice(0, 5));
      setTotalCount(res.total ?? arts.length);
      const map = {};
      for (const a of arts) {
        const e = a.env || 'DEV';
        map[e] = (map[e] || 0) + 1;
      }
      setEnvData(
        Object.entries(map).map(([label, value]) => ({ label, value }))
      );
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  return (
    <div className="home-layout">
      <aside className="home-sidebar">
        <div className="sidebar-brand">
          <h2>AMLI</h2>
        </div>
        <nav className="sidebar-nav">
          {TOOLS.map((tool) => {
            const content = (
              <>
                <span className="sidebar-icon">{tool.icon}</span>
                <div className="sidebar-item-text">
                  <span className="sidebar-item-name">{tool.name}</span>
                  <span className="sidebar-item-desc">{tool.desc}</span>
                </div>
              </>
            );
            if (tool.external) {
              return (
                <a key={tool.name} href={tool.href} target="_blank" rel="noopener noreferrer" className="sidebar-link">
                  {content}
                </a>
              );
            }
            return (
              <Link key={tool.name} to={tool.path} className="sidebar-link">
                {content}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle sidebar-theme-btn" onClick={toggleTheme}>
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>
      </aside>

      <main className="home-main">
        <div className="home-container">
          <section className="hero-section">
            <h1>DASHBOARD</h1>
            <p>
              A suite of professional encryption, decryption, and artifact
              management tools designed for speed, security, and developer
              productivity.
            </p>
          </section>

          <div className="dashboard-stats">
            {!loaded ? (
              <>
                <SkeletonStatCard />
                <SkeletonStatCard />
                <SkeletonStatCard />
                <SkeletonStatCard />
              </>
            ) : (
              <>
                {envData.map((d) => (
                  <div key={d.label} className="stat-card">
                    <div className="stat-card-icon">
                      {d.label === 'DEV' ? '🛠' : d.label === 'UAT' ? '🧪' : '🚀'}
                    </div>
                    <span className="stat-value">{d.value}</span>
                    <span className="stat-label">{d.label}</span>
                  </div>
                ))}
                <Link to="/library" className="stat-card stat-card--link">
                  <div className="stat-card-icon">📚</div>
                  <span className="stat-value">{totalCount}</span>
                  <span className="stat-label">Total</span>
                </Link>
                <Link to="/credentials" className="stat-card stat-card--link">
                  <div className="stat-card-icon">🔑</div>
                  <span className="stat-value">{'>>'}</span>
                  <span className="stat-label">Credentials</span>
                </Link>
              </>
            )}
          </div>

          {!loaded ? (
            <div className="chart-section">
              <SkeletonChart />
            </div>
          ) : envData.length > 0 && (
            <div className="chart-section">
              <EnvBarChart data={envData} />
            </div>
          )}

          <div className="recent-section">
            <h2 className="recent-title">Recent Artifacts</h2>
            {!loaded ? (
              <div className="recent-grid">
                <SkeletonRecentCard />
                <SkeletonRecentCard />
                <SkeletonRecentCard />
              </div>
            ) : recent.length > 0 ? (
              <div className="recent-grid">
                {recent.map((art) => (
                  <Link key={art.id} to="/library" className="recent-card">
                    <div className="recent-card-top">
                      <span className="badge-env" data-env={art.env}>
                        {art.env || 'DEV'}
                      </span>
                      <span className="recent-date">
                        {toDate(art.timestamp)?.toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short',
                        }) || ''}
                      </span>
                    </div>
                    <div className="recent-card-body">
                      <strong>{art.apiName || 'Unnamed'}</strong>
                      <span className="recent-ticket">{art.jiraTicket}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                No artifacts yet. Generate one in the Artifacts tool.
              </p>
            )}
          </div>

          <footer className="footer-minimal">
            Built by <strong>Dikshit Sharma</strong> | dikshit.sharma2580@gmail.com
          </footer>
        </div>
      </main>
    </div>
  );
}