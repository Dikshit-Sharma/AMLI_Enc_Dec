import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const TOOLS = [
  { path: '/', icon: '🏠', name: 'Home', desc: 'Dashboard with stats and analytics.' },
  { path: '/cipher', icon: '🔐', name: 'Cipher Tool', desc: 'AES encryption/decryption with GCM and CBC modes.' },
  { path: '/artifacts', icon: '💎', name: 'Artifacts', desc: 'Generate structured documentation packages and ZIP archives.' },
  { path: '/library', icon: '📚', name: 'API Library', desc: 'Browse, search, and re-download past artifact configurations.' },
  { path: '/credentials', icon: '🔑', name: 'Credentials', desc: 'Manage secrets for DEV, UAT, and PROD environments.' },
  { path: '/bsa', icon: '📊', name: 'BSA', desc: 'Business Stakeholder Alignment — API consumers and SPOC mapping.' },
  { href: 'https://microsoftedge.microsoft.com/addons/detail/reposcope/oaimoakbhmeehijoncpbijcdpinhndof', icon: '🔍', name: 'RepoScope', desc: 'Git repository analytics — activity, contributors, codebase insights.', external: true },
  { path: '/clipboard', icon: '📋', name: 'Clipboard', desc: 'Real-time collaborative rich text editor for teams.' },
];

export default function Sidebar({ theme, toggleTheme, counts, open, onToggle }) {
  const location = useLocation();

  return (
    <>
      <button className="sidebar-hamburger" onClick={onToggle} title="Toggle navigation">
        {open ? '✕' : '☰'}
      </button>
      <div className={`sidebar-overlay${open ? ' sidebar-overlay--visible' : ''}`} onClick={onToggle} />
      <aside className={`home-sidebar${open ? ' home-sidebar--open' : ''}`}>
        <div className="sidebar-brand">
          <Link to="/" style={{ textDecoration: 'none' }} onClick={onToggle}>
            <h2>AMLI</h2>
          </Link>
        </div>
        <nav className="sidebar-nav">
          {TOOLS.map((tool) => {
            const isActive = !tool.external && (
              tool.path === '/' ? location.pathname === '/' : location.pathname.startsWith(tool.path)
            );
            const content = (
              <>
                <span className="sidebar-icon">{tool.icon}</span>
                <div className="sidebar-item-text">
                  <span className="sidebar-item-name">{tool.name}</span>
                  <span className="sidebar-item-desc">{tool.desc}</span>
                </div>
                {counts && tool.path === '/credentials' && counts.credentials > 0 && (
                  <span className="sidebar-badge">{counts.credentials}</span>
                )}
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
              <Link key={tool.name} to={tool.path} className={`sidebar-link${isActive ? ' sidebar-link--active' : ''}`} onClick={onToggle}>
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
    </>
  );
}
