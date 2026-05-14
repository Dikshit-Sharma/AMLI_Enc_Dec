import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchArtifacts, fetchCredentials, toDate } from './api';
import { SkeletonStatCard, SkeletonRecentCard, SkeletonChart } from './Skeleton';

const ENVS = ['DEV', 'UAT', 'PROD'];
const ENV_COLORS = { DEV: '#10b981', UAT: '#f59e0b', PROD: '#ef4444' };
const ENV_ICONS = { DEV: '🛠', UAT: '🧪', PROD: '🚀' };

function DonutChart({ data }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  const r = 72;
  const cx = 100;
  const cy = 100;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-container">
      <div className="donut-chart-area">
        <div className="donut-center">
          <span className="donut-total">{total}</span>
          <span className="donut-total-label">total</span>
        </div>
        <svg width="180" height="180" viewBox="0 0 200 200">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="20" />
          {data.map((d) => {
            const seg = (d.value / total) * circ;
            const dash = `${seg} ${circ - seg}`;
            const cls = (
              <circle
                key={d.label}
                cx={cx} cy={cy} r={r} fill="none"
                stroke={ENV_COLORS[d.label] || '#6366f1'}
                strokeWidth="20"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
            );
            offset += seg;
            return cls;
          })}
        </svg>
      </div>
      <div className="donut-legend">
        {data.map((d) => (
          <div key={d.label} className="donut-legend-item">
            <span className="donut-dot" style={{ background: ENV_COLORS[d.label] || '#6366f1' }} />
            <span className="donut-label">{d.label}</span>
            <span className="donut-value">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyChart({ artifacts }) {
  const weeks = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: d.toLocaleDateString('en-IN', { weekday: 'short' }), count: 0 });
    }
    for (const a of artifacts || []) {
      const ts = toDate(a.timestamp);
      if (!ts) continue;
      const key = ts.toISOString().slice(0, 10);
      const day = days.find((d) => d.key === key);
      if (day) day.count++;
    }
    return days;
  }, [artifacts]);

  const max = Math.max(...weeks.map((d) => d.count), 1);
  return (
    <div className="chart-container">
      <h3 className="chart-title">Weekly Activity</h3>
      <div className="weekly-bars">
        {weeks.map((d) => (
          <div key={d.key} className="weekly-bar-col">
            <span className="weekly-bar-count">{d.count}</span>
            <div className="weekly-bar-track">
              <div className="weekly-bar-fill" style={{ height: `${(d.count / max) * 100}%` }} />
            </div>
            <span className="weekly-bar-label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopApis({ artifacts }) {
  const tops = useMemo(() => {
    const map = {};
    for (const a of artifacts || []) {
      const name = a.apiName || 'Unnamed';
      map[name] = (map[name] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [artifacts]);

  if (tops.length === 0) return null;
  const max = tops[0][1];
  return (
    <div className="chart-container">
      <h3 className="chart-title">Top APIs</h3>
      <div className="topapi-list">
        {tops.map(([name, count]) => (
          <div key={name} className="topapi-row">
            <span className="topapi-name">{name}</span>
            <div className="topapi-bar-track">
              <div className="topapi-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="topapi-count">{count}</span>
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
  const [allArts, setAllArts] = useState([]);
  const [envData, setEnvData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [credStats, setCredStats] = useState(null);

  useEffect(() => {
    Promise.all([
      fetchArtifacts(),
      Promise.all(ENVS.map((e) =>
        fetchCredentials(e).then((r) => [e, r.credentials || []]).catch(() => [e, []])
      )),
    ]).then(([artRes, credRes]) => {
      const arts = artRes.artifacts || [];
      setAllArts(arts);
      setRecent(arts.slice(0, 5));
      setTotalCount(artRes.total ?? arts.length);
      const map = {};
      for (const a of arts) {
        const e = a.env || 'DEV';
        map[e] = (map[e] || 0) + 1;
      }
      setEnvData(Object.entries(map).map(([label, value]) => ({ label, value })));
      const credMap = Object.fromEntries(credRes);
      setCredStats(credMap);
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
                <SkeletonStatCard />
              </>
            ) : (
              <>
                {envData.map((d) => (
                  <div key={d.label} className="stat-card">
                    <div className="stat-card-icon">{ENV_ICONS[d.label]}</div>
                    <span className="stat-value">{d.value}</span>
                    <span className="stat-label">{d.label}</span>
                  </div>
                ))}
                <Link to="/library" className="stat-card stat-card--link">
                  <div className="stat-card-icon">📚</div>
                  <span className="stat-value">{totalCount}</span>
                  <span className="stat-label">Total Artifacts</span>
                </Link>
                <Link to="/credentials" className="stat-card stat-card--link">
                  <div className="stat-card-icon">🔑</div>
                  <span className="stat-value">
                    {credStats ? Object.values(credStats).reduce((s, c) => s + c.length, 0) : '--'}
                  </span>
                  <span className="stat-label">Credentials</span>
                </Link>
              </>
            )}
          </div>

          {!loaded ? (
            <>
              <div className="chart-section">
                <SkeletonChart />
              </div>
              <div className="chart-grid-2">
                <div className="chart-section"><SkeletonChart /></div>
                <div className="chart-section"><SkeletonChart /></div>
              </div>
            </>
          ) : (
            <>
              <div className="chart-grid-2">
                <div className="chart-section">
                  <DonutChart data={envData} />
                </div>
                <div className="chart-section">
                  <WeeklyChart artifacts={allArts} />
                </div>
              </div>
              {credStats && (
                <div className="chart-grid-2">
                  <div className="chart-section">
                    <TopApis artifacts={allArts} />
                  </div>
                  <div className="chart-section">
                    <div className="chart-container">
                      <h3 className="chart-title">Credentials by Environment</h3>
                      <div className="cred-stats-grid">
                        {ENVS.map((env) => {
                          const list = credStats[env] || [];
                          const manual = list.filter((c) => c._source !== 'artifact').length;
                          const extracted = list.filter((c) => c._source === 'artifact').length;
                          return (
                            <div key={env} className="cred-stat-card" style={{ borderLeftColor: ENV_COLORS[env] }}>
                              <div className="cred-stat-header">
                                <span>{ENV_ICONS[env]}</span>
                                <span style={{ fontWeight: 700 }}>{env}</span>
                              </div>
                              <div className="cred-stat-total">{list.length}</div>
                              <div className="cred-stat-breakdown">
                                <span>📝 {manual} manual</span>
                                <span>🔍 {extracted} extracted</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
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