import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchArtifacts, fetchCredentials } from './api';
import { logAnalyticsEvent } from './firebase';
import './CommandPalette.css';

const ENVS = ['DEV', 'UAT', 'PROD'];

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ library: [], credentials: [] });
  const [loaded, setLoaded] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIdx(0);
    setLoaded(false);
    Promise.all([
      fetchArtifacts(),
      Promise.all(ENVS.map((e) => fetchCredentials(e).then((r) => r.credentials || []).catch(() => []))),
    ]).then(([artRes, credRes]) => {
      setData({
        library: artRes.artifacts || [],
        credentials: credRes.flat(),
      });
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const results = React.useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const lib = data.library.filter((a) =>
      a.apiName?.toLowerCase().includes(q) ||
      a.jiraTicket?.toLowerCase().includes(q) ||
      a.env?.toLowerCase().includes(q)
    ).slice(0, 6);
    const creds = data.credentials.filter((c) =>
      c.soaAppId?.toLowerCase().includes(q) ||
      c.apiName?.toLowerCase().includes(q) ||
      c.env?.toLowerCase().includes(q)
    ).slice(0, 6);
    const out = [];
    if (lib.length) out.push({ category: 'Library', items: lib });
    if (creds.length) out.push({ category: 'Credentials', items: creds });
    return out;
  }, [query, data]);

  const flatItems = results.flatMap((g) => g.items);
  useEffect(() => { setSelectedIdx(0); }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((p) => Math.min(p + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((p) => Math.max(p - 1, 0));
    } else if (e.key === 'Enter' && flatItems[selectedIdx]) {
      const item = flatItems[selectedIdx];
      logAnalyticsEvent('cmd_palette_select', { item_id: item.id, source: 'keyboard' });
      if (item.id?.startsWith('art_')) {
        navigate('/credentials');
      } else {
        navigate('/library');
      }
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-wrapper">
          <span className="cmd-search-icon">⌕</span>
          <input
            ref={inputRef}
            type="text"
            className="cmd-input"
            placeholder="Search Library & Credentials..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <span className="cmd-esc-hint">ESC</span>
        </div>
        <div className="cmd-results">
          {!loaded ? (
            <div className="cmd-loading">Loading...</div>
          ) : results.length === 0 && query.trim() ? (
            <div className="cmd-empty">No results for "{query}"</div>
          ) : query.trim() === '' ? (
            <div className="cmd-hint">Type to search across Library artifacts and Credentials</div>
          ) : (
            results.map((group) => (
              <div key={group.category} className="cmd-group">
                <div className="cmd-group-title">{group.category}</div>
                {group.items.map((item, i) => {
                  const idx = flatItems.indexOf(item);
                  return (
                    <div
                      key={`${group.category}-${item.id || i}`}
                      className={`cmd-item ${idx === selectedIdx ? 'selected' : ''}`}
                      onClick={() => {
                        logAnalyticsEvent('cmd_palette_select', { item_id: item.id, source: 'click' });
                        if (item.id?.startsWith('art_')) navigate('/credentials');
                        else navigate('/library');
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIdx(idx)}
                    >
                      <span className="cmd-item-icon">
                        {group.category === 'Library' ? '📚' : '🔑'}
                      </span>
                      <div className="cmd-item-text">
                        <span className="cmd-item-name">
                          {group.category === 'Library' ? item.apiName || 'Unnamed' : item.soaAppId || 'Unknown'}
                        </span>
                        <span className="cmd-item-sub">
                          {item.jiraTicket || item.apiName || ''}
                          {item.env ? ` · ${item.env}` : ''}
                        </span>
                      </div>
                      {item.env && (
                        <span className={`cmd-env-badge`} data-env={item.env}>
                          {item.env}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}