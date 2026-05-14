import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchArtifacts, toDate } from './api';

export default function HomePage({ theme, toggleTheme }) {
  const [recent, setRecent] = useState([]);
  const [stats, setStats] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchArtifacts({ limit: 5 }).then((res) => {
      setRecent(res.artifacts || []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded || recent.length === 0) return;
    const envCount = {};
    for (const a of recent) {
      const e = a.env || 'DEV';
      envCount[e] = (envCount[e] || 0) + 1;
    }
    setStats(envCount);
  }, [loaded, recent]);

  return (
    <>
      <div
        className="theme-toggle-wrapper"
        style={{
          position: 'fixed',
          top: '2rem',
          right: '2rem',
          zIndex: 100,
          display: 'flex',
          gap: '0.5rem',
        }}
      >
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
      <div className="home-container">
        <section className="hero-section">
          <h1>AMLI TOOLS</h1>
          <p>
            A suite of professional encryption, decryption, and artifact
            management tools designed for speed, security, and developer
            productivity.
          </p>
        </section>

        <div className="dashboard-stats">
          {stats &&
            Object.entries(stats).map(([env, count]) => (
              <div key={env} className="stat-card">
                <span className="stat-value">{count}</span>
                <span className="stat-label">{env}</span>
              </div>
            ))}
          <Link to="/library" className="stat-card stat-card--link">
            <span className="stat-value">{recent.length > 0 ? `${recent.length}+` : '--'}</span>
            <span className="stat-label">Recent</span>
          </Link>
          <Link to="/credentials" className="stat-card stat-card--link">
            <span className="stat-value">🔑</span>
            <span className="stat-label">Credentials</span>
          </Link>
        </div>

        <div className="tools-grid">
          <Link to="/cipher" className="tool-card">
            <div className="card-icon">🔐</div>
            <h3>Cipher Tool</h3>
            <p>
              Secure AES encryption and decryption with support for GCM and CBC
              modes. Advanced auto-formatting and validation built-in.
            </p>
          </Link>

          <Link to="/artifacts" className="tool-card">
            <div className="card-icon">💎</div>
            <h3>Artifacts</h3>
            <p>
              Generate highly-structured documentation packages and ZIP archives
              for SOA requests with automated encryption support.
            </p>
          </Link>

          <Link to="/library" className="tool-card">
            <div className="card-icon">📚</div>
            <h3>API Library</h3>
            <p>
              Access your history of generated artifacts. Search, review, and
              re-download past configurations with ease.
            </p>
          </Link>

          <Link to="/credentials" className="tool-card">
            <div className="card-icon">🔑</div>
            <h3>Credentials</h3>
            <p>
              Manage environment variables and secrets for DEV, UAT, and PROD.
              Store API keys, client secrets, and AES keys securely.
            </p>
          </Link>

          <a
            href="https://sharedclip.netlify.app/"
            className="tool-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="card-icon">📋</div>
            <h3>SharedClip</h3>
            <p>
              Real-time collaborative clipboard for seamless data sharing across
              teams and devices. Simple, fast, and secure.
            </p>
          </a>
        </div>

        {recent.length > 0 && (
          <div className="recent-section">
            <h2 className="recent-title">Recent Artifacts</h2>
            <div className="recent-grid">
              {recent.map((art) => (
                <Link
                  key={art.id}
                  to="/library"
                  className="recent-card"
                >
                  <div className="recent-card-top">
                    <span className="badge-env" data-env={art.env}>
                      {art.env || 'DEV'}
                    </span>
                    <span className="recent-date">
                      {toDate(art.timestamp)?.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
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
          </div>
        )}

        <footer className="footer-minimal">
          Built by <strong>Dikshit Sharma</strong> | dikshit.sharma2580@gmail.com
        </footer>
      </div>
    </>
  );
}
