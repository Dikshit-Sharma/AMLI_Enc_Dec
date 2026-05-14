import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchArtifacts, toDate } from './api';
import { generateAndDownloadZip, generateBulkZip } from './artifactUtil';
import { decrypt, decryptCBC } from './cryptoUtil';
import ArtifactComparator from './ArtifactComparator';
import LibraryInsights from './LibraryInsights';

const PAGE_SIZE = 20;

const LibraryPage = ({ theme, toggleTheme }) => {
  const [artifacts, setArtifacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem('lib_auth') === 'true'
  );
  const [password, setPassword] = useState('');
  const [passError, setPassError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [compareArtifacts, setCompareArtifacts] = useState(null);
  const [showInsights, setShowInsights] = useState(false);

  const [cursorStack, setCursorStack] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const LIB_PASSWORD = import.meta.env.VITE_LIBRARY_PASSWORD || "*******************";

  const loadPage = async (cursor) => {
    setLoading(true);
    try {
      const res = await fetchArtifacts({ limit: PAGE_SIZE, cursor });
      setArtifacts(res.artifacts || []);
      setNextCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
      if (res.total !== undefined) setTotalCount(res.total);
    } catch (err) {
      console.error('Failed to load artifacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadPage(null);
    setCursorStack([]);
    setPageNum(1);
  }, [isAuthenticated]);

  const handleNextPage = () => {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, nextCursor]);
    setPageNum((p) => p + 1);
    loadPage(nextCursor);
  };

  const handlePrevPage = () => {
    if (cursorStack.length === 0) return;
    const prev = cursorStack.slice(0, -1);
    const prevCursor = prev.length > 0 ? prev[prev.length - 1] : null;
    setCursorStack(prev);
    setPageNum((p) => p - 1);
    loadPage(prevCursor);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password === LIB_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('lib_auth', 'true');
      setPassError('');
    } else {
      setPassError('Incorrect password. Please try again.');
    }
  };

  const filteredArtifacts = artifacts.filter((art) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      art.apiName?.toLowerCase().includes(q) ||
      art.jiraTicket?.toLowerCase().includes(q) ||
      art.env?.toLowerCase().includes(q) ||
      art.curl?.toLowerCase().includes(q)
    );
  });

  const [copyStatus, setCopyStatus] = useState({});
  const [downloadingStatus, setDownloadingStatus] = useState({});

  const handleCopyCurl = (id, curl) => {
    navigator.clipboard.writeText(curl).then(() => {
      setCopyStatus((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopyStatus((prev) => ({ ...prev, [id]: false }));
      }, 2000);
    });
  };

  const handleDownload = async (art) => {
    setDownloadingStatus((prev) => ({ ...prev, [art.id]: true }));
    try {
      await generateAndDownloadZip([art], decrypt, decryptCBC);
    } catch (err) {
      console.error('Re-download failed:', err);
      alert('Re-download failed: ' + err.message);
    } finally {
      setDownloadingStatus((prev) => ({ ...prev, [art.id]: false }));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      return [...prev, id];
    });
  };

  const handleCompare = () => {
    const [idA, idB] = selectedIds.slice(0, 2);
    const a = artifacts.find((a) => a.id === idA);
    const b = artifacts.find((b) => b.id === idB);
    if (a && b) setCompareArtifacts({ artifactA: a, artifactB: b });
  };

  const handleBulkDownload = () => {
    const selected = artifacts.filter((a) => selectedIds.includes(a.id));
    if (selected.length === 0) return;
    generateBulkZip(selected, decrypt, decryptCBC).catch((err) =>
      alert('Download failed: ' + err.message)
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="card" style={{ maxWidth: '500px', flex: 'none', height: 'auto' }}>
          <Link to="/" className="back-link">
            ← Back to Home
          </Link>
          <h2 style={{ marginTop: '1.5rem' }}>Library Protected</h2>
          <p
            className="field-label"
            style={{
              color: 'var(--text-muted)',
              textTransform: 'none',
              marginBottom: '2rem',
            }}
          >
            Please enter the secret password to access the API Library.
          </p>
          <form onSubmit={handlePasswordSubmit}>
            <div className="form-group">
              <input
                type="password"
                className="main-input"
                placeholder="Enter Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            {passError && (
              <div className="error-message">
                <span>⚠️ {passError}</span>
              </div>
            )}
            <button
              type="submit"
              className="btn-primary full-width"
              style={{ marginTop: '2rem' }}
            >
              Unlock Library
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div
          className="top-nav-row"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>
              ← Back
            </Link>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Link
              to="/credentials"
              className="badge-ticket link"
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: 'rgba(16,185,129,0.15)',
                border: '1px solid rgba(16,185,129,0.3)',
                color: 'var(--success)',
                borderRadius: '0.75rem',
              }}
            >
              🔑 Credentials
            </Link>
            <span
              className="badge-ticket"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              Total: {totalCount}
            </span>
            {selectedIds.length > 0 && (
              <>
                <button
                  style={{
                    background: 'rgba(16,185,129,0.15)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: '0.75rem',
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    color: 'var(--success)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    width: 'auto',
                    flex: 'none',
                  }}
                  onClick={handleBulkDownload}
                >
                  📦 Download ({selectedIds.length})
                </button>
                {selectedIds.length === 2 && (
                  <button
                    className="btn-primary"
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.8rem',
                      width: 'auto',
                      flex: 'none',
                    }}
                    onClick={handleCompare}
                  >
                    ↔ Compare
                  </button>
                )}
              </>
            )}
            <button
              style={{
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '0.75rem',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                color: 'var(--primary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                width: 'auto',
                flex: 'none',
              }}
              onClick={() => setShowInsights(true)}
            >
              📊 Insights
            </button>
          </div>
        </div>

        <h1>API LIBRARY</h1>

        <div className="form-group" style={{ margin: '2rem 0' }}>
          <input
            type="text"
            className="main-input"
            placeholder="Search by API Name, Jira Ticket, ENV, or Curl..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ fontSize: '1.1rem', padding: '1.25rem' }}
          />
          {searchTerm && (
            <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {filteredArtifacts.length} of {artifacts.length} on this page match
            </div>
          )}
        </div>

        <div className="scrollable" style={{ flex: 1, minHeight: 0 }}>
          {loading ? (
            <div className="loading-state" style={{ textAlign: 'center', padding: '4rem' }}>
              <div className="loader" style={{ margin: '0 auto' }}></div>
              <p style={{ marginTop: '1.5rem', color: 'var(--text-muted)' }}>
                Loading library...
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="api-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Sr.</th>
                    <th>API NAME</th>
                    <th>ENV</th>
                    <th>JIRA TICKET</th>
                    <th>DATE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArtifacts.length > 0 ? (
                    filteredArtifacts.map((art, index) => (
                      <tr
                        key={art.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => toggleSelect(art.id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(art.id)}
                            onChange={() => toggleSelect(art.id)}
                            style={{
                              width: '16px',
                              height: '16px',
                              cursor: 'pointer',
                              accentColor: 'var(--primary)',
                            }}
                          />
                        </td>
                        <td>{(pageNum - 1) * PAGE_SIZE + index + 1}</td>
                        <td style={{ fontWeight: 600 }}>{art.apiName}</td>
                        <td>
                          <span className="badge-env" data-env={art.env}>
                            {art.env || 'DEV'}
                          </span>
                        </td>
                        <td>
                          <a
                            href={`https://axismaxlife.atlassian.net/browse/${art.jiraTicket}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="badge-ticket link"
                          >
                            {art.jiraTicket}
                          </a>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {toDate(art.timestamp)?.toLocaleString('en-IN', {
                            dateStyle: 'medium',
                          }) || 'Unknown'}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              className={`copy-icon-btn ${copyStatus[art.id] ? 'copied' : ''}`}
                              onClick={() => handleCopyCurl(art.id, art.curl)}
                              title="Copy Curl"
                            >
                              {copyStatus[art.id] ? '✓' : '📋'}
                            </button>
                            <button
                              className="copy-icon-btn download-btn"
                              onClick={() => handleDownload(art)}
                              disabled={downloadingStatus[art.id]}
                              title="Download ZIP"
                            >
                              {downloadingStatus[art.id] ? (
                                <div className="loader tiny"></div>
                              ) : (
                                '📦'
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="7"
                        style={{
                          textAlign: 'center',
                          padding: '3rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        No results found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div
            className="pagination-bar"
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '1rem',
              marginTop: '1.5rem',
              padding: '1rem 0',
            }}
          >
            <button
              className="btn-pagination"
              disabled={cursorStack.length === 0}
              onClick={handlePrevPage}
              style={{
                background: cursorStack.length === 0
                  ? 'rgba(255,255,255,0.05)'
                  : 'var(--input-bg)',
                border: '1px solid var(--border)',
                borderRadius: '0.75rem',
                padding: '0.5rem 1.25rem',
                cursor: cursorStack.length === 0 ? 'not-allowed' : 'pointer',
                color: cursorStack.length === 0 ? 'var(--text-muted)' : 'var(--text)',
                fontSize: '0.85rem',
                fontWeight: 600,
                opacity: cursorStack.length === 0 ? 0.5 : 1,
              }}
            >
              ← Prev
            </button>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Page {pageNum}
            </span>
            <button
              className="btn-pagination"
              disabled={!hasMore}
              onClick={handleNextPage}
              style={{
                background: !hasMore
                  ? 'rgba(255,255,255,0.05)'
                  : 'var(--input-bg)',
                border: '1px solid var(--border)',
                borderRadius: '0.75rem',
                padding: '0.5rem 1.25rem',
                cursor: !hasMore ? 'not-allowed' : 'pointer',
                color: !hasMore ? 'var(--text-muted)' : 'var(--text)',
                fontSize: '0.85rem',
                fontWeight: 600,
                opacity: !hasMore ? 0.5 : 1,
              }}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {compareArtifacts && (
        <ArtifactComparator
          artifactA={compareArtifacts.artifactA}
          artifactB={compareArtifacts.artifactB}
          onClose={() => {
            setCompareArtifacts(null);
            setSelectedIds([]);
          }}
        />
      )}

      {showInsights && (
        <LibraryInsights onClose={() => setShowInsights(false)} />
      )}
    </div>
  );
};

export default LibraryPage;
