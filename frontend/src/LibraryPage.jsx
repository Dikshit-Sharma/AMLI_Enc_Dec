import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchArtifacts, fetchArtifact, toDate } from './api';
import { generateAndDownloadZip, generateBulkZip } from './artifactUtil';
import { decrypt, decryptCBC } from './cryptoUtil';
import { logAnalyticsEvent } from './firebase';
import ArtifactComparator from './ArtifactComparator';
import LibraryInsights from './LibraryInsights';
import { SkeletonTableRows } from './Skeleton';

const LibraryPage = ({ theme, toggleTheme }) => {
  const [allArtifacts, setAllArtifacts] = useState([]);
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
  const [expandedId, setExpandedId] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [fullArtifacts, setFullArtifacts] = useState({});
  const [loadingFull, setLoadingFull] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    fetchArtifacts({ limit: 10000 })
      .then(res => {
        const list = res.artifacts || [];
        setAllArtifacts(list);
        if (res.total !== undefined) setTotalCount(res.total);
      })
      .catch(err => console.error('Failed to load artifacts:', err))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const getFullArtifact = async (id) => {
    if (fullArtifacts[id]) return fullArtifacts[id];
    setLoadingFull(id);
    try {
      const res = await fetchArtifact(id);
      const full = res.artifact;
      setFullArtifacts(prev => ({ ...prev, [id]: full }));
      return full;
    } catch (err) {
      console.error('Failed to fetch full artifact:', err);
      return allArtifacts.find(a => a.id === id) || null;
    } finally {
      setLoadingFull(null);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPassError('');
    try {
      const res = await fetch('/api/auth-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.valid) {
        setIsAuthenticated(true);
        sessionStorage.setItem('lib_auth', 'true');
        setPassError('');
      } else {
        setPassError('Incorrect password. Please try again.');
      }
    } catch (err) {
      setPassError('Authentication failed. Please try again.');
    }
  };

  const displayArtifacts = allArtifacts.filter(art => {
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

  const handleCopyCurl = async (id) => {
    const full = await getFullArtifact(id);
    if (!full?.curl) return;
    navigator.clipboard.writeText(full.curl).then(() => {
      logAnalyticsEvent('artifact_copy_curl', { artifact_id: id });
      setCopyStatus((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopyStatus((prev) => ({ ...prev, [id]: false }));
      }, 2000);
    });
  };

  const handleDownload = async (art) => {
    setDownloadingStatus((prev) => ({ ...prev, [art.id]: true }));
    try {
      const full = await getFullArtifact(art.id);
      await generateAndDownloadZip([full], decrypt, decryptCBC);
      logAnalyticsEvent('artifact_download', { artifact_id: art.id, api_name: art.apiName, env: art.env });
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

  const handleCompare = async () => {
    const [idA, idB] = selectedIds.slice(0, 2);
    const [fullA, fullB] = await Promise.all([
      getFullArtifact(idA),
      getFullArtifact(idB),
    ]);
    if (fullA && fullB) {
      setCompareArtifacts({ artifactA: fullA, artifactB: fullB });
      logAnalyticsEvent('artifact_compare', { artifact_a_id: idA, artifact_b_id: idB });
    }
  };

  const handleBulkDownload = async () => {
    const selected = allArtifacts.filter((a) => selectedIds.includes(a.id));
    if (selected.length === 0) return;
    setLoadingFull('bulk');
    try {
      const fullList = await Promise.all(selected.map(a => getFullArtifact(a.id)));
      await generateBulkZip(fullList.filter(Boolean), decrypt, decryptCBC);
      logAnalyticsEvent('artifact_download_bulk', { count: selected.length });
    } catch (err) {
      alert('Download failed: ' + err.message);
    } finally {
      setLoadingFull(null);
    }
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
              onClick={() => { logAnalyticsEvent('library_insights_open', { total_artifacts: allArtifacts.length }); setShowInsights(true); }}
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
              {displayArtifacts.length} of {allArtifacts.length} match
            </div>
          )}
        </div>

        <div className="scrollable" style={{ flex: 1, minHeight: 0 }}>
          {loading ? (
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
                  <SkeletonTableRows rows={6} cols={7} />
                </tbody>
              </table>
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
                  {displayArtifacts.length > 0 ? (
                    displayArtifacts.map((art, index) => (
                      <React.Fragment key={art.id}>
                        <tr
                          style={{ cursor: 'pointer' }}
                          onClick={async () => {
                            const next = expandedId === art.id ? null : art.id;
                            setExpandedId(next);
                            if (next && !fullArtifacts[next]) {
                              await getFullArtifact(next);
                            }
                          }}
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
                          <td>{index + 1}</td>
                          <td style={{ fontWeight: 600 }}>
                            {expandedId === art.id ? '▼' : '▶'} {art.apiName}
                          </td>
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
                                onClick={() => handleCopyCurl(art.id)}
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
                        {expandedId === art.id && (
                          <tr className="expanded-row-content">
                            <td colSpan="7">
                              <div className="expanded-row-inner">
                                {loadingFull === art.id ? (
                                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                    <div className="loader tiny" style={{ margin: '0 auto 0.5rem' }} />
                                    Loading full artifact...
                                  </div>
                                ) : fullArtifacts[art.id] ? (
                                  <>
                                    <div>
                                      <div className="field-label">Curl Command</div>
                                      <div className="curl-preview">{fullArtifacts[art.id].curl || '(empty)'}</div>
                                    </div>
                                    <div>
                                      <div className="field-label">Response</div>
                                      <div className="response-preview">{fullArtifacts[art.id].response || '(empty)'}</div>
                                    </div>
                                  </>
                                ) : (
                                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                    Click to load full details
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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

          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Loading artifacts...
            </div>
          )}
          {!loading && (
            <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Showing all {allArtifacts.length} artifacts
              {totalCount > allArtifacts.length && ` (first ${allArtifacts.length} of ${totalCount})`}
            </div>
          )}
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
