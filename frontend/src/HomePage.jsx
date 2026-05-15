import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchArtifacts, fetchCredentials, toDate } from './api';
import { SkeletonStatCard, SkeletonRecentCard, SkeletonChart } from './Skeleton';
import { extractFromArtifact } from './credentialExtract';

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

function VelocityChart({ artifacts }) {
  const [hovered, setHovered] = useState(null);

  const { data, maxCount, total, avg } = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        count: 0, ma7: null,
      });
    }
    for (const a of artifacts || []) {
      const ts = toDate(a.timestamp);
      if (!ts) continue;
      const day = days.find(d => d.date === ts.toISOString().slice(0, 10));
      if (day) day.count++;
    }
    for (let i = 0; i < days.length; i++) {
      if (i >= 6) {
        let sum = 0;
        for (let j = i - 6; j <= i; j++) sum += days[j].count;
        days[i].ma7 = Math.round((sum / 7) * 10) / 10;
      }
    }
    return {
      data: days,
      maxCount: Math.max(...days.map(d => d.count), 1),
      total: days.reduce((s, d) => s + d.count, 0),
      avg: Math.round((days.reduce((s, d) => s + d.count, 0) / 30) * 10) / 10,
    };
  }, [artifacts]);

  const M = { top: 22, right: 16, bottom: 28, left: 36 };
  const W = 800, H = 220;
  const cw = W - M.left - M.right;
  const ch = H - M.top - M.bottom;

  const xS = (i) => M.left + (data.length > 1 ? (i / (data.length - 1)) * cw : cw / 2);
  const yS = (v) => M.top + ch - (v / maxCount) * ch;
  const baseY = M.top + ch;

  const pts = data.map((d, i) => ({ x: xS(i), y: yS(d.count) }));
  const areaPath = `M${pts[0].x},${baseY} L${pts.map(p => `${p.x},${p.y}`).join(' L')} L${pts[pts.length - 1].x},${baseY} Z`;
  const linePath = `M${pts.map(p => `${p.x},${p.y}`).join(' L')}`;

  const maPts = data.filter(d => d.ma7 !== null).map(d => {
    const idx = data.indexOf(d);
    return { x: xS(idx), y: yS(d.ma7) };
  });
  const maPath = maPts.length > 1 ? `M${maPts.map(p => `${p.x},${p.y}`).join(' L')}` : '';
  const maDotIdx = hovered !== null && hovered >= 6 ? hovered : null;

  const grids = Array.from({ length: 5 }, (_, i) => {
    const r = i / 4;
    return { y: M.top + ch - r * ch, label: Math.round(maxCount * r) };
  });

  const xLabels = data.filter((_, i) => i % 5 === 0 || i === data.length - 1);
  const colW = cw / data.length;

  return (
    <div className="chart-container">
      <div className="chart-title-row">
        <h3 className="chart-title">Artifact Generation Velocity</h3>
        <div className="velocity-stats">
          <span className="velocity-stat">{total} this month</span>
          <span className="velocity-stat">{avg}/day avg</span>
        </div>
      </div>
      <div className="velocity-chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="velocity-svg">
          <defs>
            <linearGradient id="veloGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {grids.map((g, i) => (
            <g key={i}>
              <line x1={M.left} y1={g.y} x2={W - M.right} y2={g.y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
              <text x={M.left - 5} y={g.y + 3} textAnchor="end" fill="var(--text-muted)" fontSize="9">{g.label}</text>
            </g>
          ))}

          {areaPath && data.length > 1 && <path d={areaPath} fill="url(#veloGrad)" />}
          {linePath && data.length > 1 && <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          {maPath && <path d={maPath} fill="none" stroke="var(--secondary)" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round" />}

          {xLabels.map((d, i) => {
            const idx = data.indexOf(d);
            return (
              <text key={i} x={xS(idx)} y={H - 4} textAnchor="middle" fill="var(--text-muted)" fontSize="9">{d.label}</text>
            );
          })}

          {/* Hover rects */}
          {data.map((d, i) => (
            <rect key={i} x={xS(i) - colW / 2} y={M.top} width={colW} height={ch} fill="transparent"
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
          ))}

          {/* Hover indicators */}
          {hovered !== null && (
            <g>
              <line x1={xS(hovered)} y1={M.top} x2={xS(hovered)} y2={baseY} stroke="var(--primary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
              <circle cx={xS(hovered)} cy={yS(data[hovered].count)} r="4" fill="var(--primary)" stroke="var(--card-bg)" strokeWidth="2" style={{ transition: 'cx 0.15s, cy 0.15s' }} />
              {maDotIdx !== null && (
                <circle cx={xS(maDotIdx)} cy={yS(data[maDotIdx].ma7)} r="4" fill="var(--secondary)" stroke="var(--card-bg)" strokeWidth="2" style={{ transition: 'cx 0.15s, cy 0.15s' }} />
              )}
              {/* Tooltip */}
              <rect x={xS(hovered) - 54} y={M.top + 4} width="108" height="40" rx="6" fill="var(--card-bg)" stroke="var(--border)" strokeWidth="1" />
              <text x={xS(hovered)} y={M.top + 18} textAnchor="middle" fill="var(--text)" fontSize="9" fontWeight="600">{data[hovered].label}</text>
              <text x={xS(hovered)} y={M.top + 31} textAnchor="middle" fill="var(--primary)" fontSize="11" fontWeight="700">{data[hovered].count} artifacts</text>
              {maDotIdx !== null && (
                <text x={xS(hovered) + 54} y={M.top + 18} textAnchor="start" fill="var(--secondary)" fontSize="8.5">{data[hovered].ma7} avg</text>
              )}
            </g>
          )}
        </svg>
      </div>
      <div className="velocity-legend">
        <span className="velocity-legend-item">
          <span className="velocity-legend-line" style={{ background: 'var(--primary)' }} />
          Daily Count
        </span>
        <span className="velocity-legend-item">
          <span className="velocity-legend-line velocity-legend-line--dashed" style={{ background: 'var(--secondary)' }} />
          7-Day Moving Average
        </span>
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
  const [range, setRange] = useState('all');

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
      const extracted = {};
      for (const env of ENVS) extracted[env] = [];
      for (const art of arts) {
        const entry = extractFromArtifact(art);
        if (entry && ENVS.includes(entry.env)) {
          extracted[entry.env].push(entry);
        }
      }
      const merged = {};
      for (const env of ENVS) {
        merged[env] = [...(credMap[env] || []), ...(extracted[env] || [])];
      }
      setCredStats(merged);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const filteredArts = React.useMemo(() => {
    if (range === 'all' || !allArts.length) return allArts;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (range === '7d' ? 7 : 30));
    return allArts.filter((a) => {
      const ts = toDate(a.timestamp);
      return ts && ts >= cutoff;
    });
  }, [allArts, range]);

  const rangeEnvData = React.useMemo(() => {
    const map = {};
    for (const a of filteredArts) {
      const e = a.env || 'DEV';
      map[e] = (map[e] || 0) + 1;
    }
    return Object.entries(map).map(([label, value]) => ({ label, value }));
  }, [filteredArts]);

  const rangeRecent = React.useMemo(() =>
    filteredArts.slice(0, 5), [filteredArts]
  );

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
                {rangeEnvData.map((d) => (
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

          <div className="range-bar">
            <span className="range-bar-label">Show:</span>
            {[
              { key: '7d', label: '7 Days' },
              { key: '30d', label: '30 Days' },
              { key: 'all', label: 'All Time' },
            ].map((r) => (
              <button
                key={r.key}
                className={`range-btn ${range === r.key ? 'active' : ''}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
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
                  <DonutChart data={rangeEnvData} />
                </div>
                <div className="chart-section">
                  <VelocityChart artifacts={filteredArts} />
                </div>
              </div>
              {credStats && (
                <div className="chart-grid-2">
                  <div className="chart-section">
                    <TopApis artifacts={filteredArts} />
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
            ) : rangeRecent.length > 0 ? (
              <div className="recent-grid">
                {rangeRecent.map((art) => (
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
                No artifacts in this period.
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