import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Link } from 'react-router-dom';
import { generateAndDownloadZip } from './artifactUtil';
import { decrypt, decryptCBC } from './cryptoUtil';
import ArtifactComparator from './ArtifactComparator';
import LibraryInsights from './LibraryInsights';

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

  const LIB_PASSWORD = import.meta.env.VITE_LIBRARY_PASSWORD || "*******************";

  useEffect(() => {
    if (!isAuthenticated) return;

    const q = query(collection(db, 'artifacts'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setArtifacts(docs);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error.code, error.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

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

  const filteredArtifacts = artifacts.filter(art =>
    art.apiName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    art.jiraTicket?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [copyStatus, setCopyStatus] = useState({});
  const [downloadingStatus, setDownloadingStatus] = useState({});

  const handleCopyCurl = (id, curl) => {
    navigator.clipboard.writeText(curl).then(() => {
      setCopyStatus(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopyStatus(prev => ({ ...prev, [id]: false }));
      }, 2000);
    });
  };

  const handleDownload = async (art) => {
    setDownloadingStatus(prev => ({ ...prev, [art.id]: true }));
    try {
      await generateAndDownloadZip([art], decrypt, decryptCBC);
    } catch (err) {
      console.error("Re-download failed:", err);
      alert("Re-download failed: " + err.message);
    } finally {
      setDownloadingStatus(prev => ({ ...prev, [art.id]: false }));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const handleCompare = () => {
    const [idA, idB] = selectedIds;
    const a = artifacts.find(a => a.id === idA);
    const b = artifacts.find(b => b.id === idB);
    if (a && b) setCompareArtifacts({ artifactA: a, artifactB: b });
  };

  if (!isAuthenticated) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="card" style={{ maxWidth: '500px', flex: 'none', height: 'auto' }}>
          <Link to="/" className="back-link">← Back to Home</Link>
          <h2 style={{ marginTop: '1.5rem' }}>Library Protected</h2>
          <p className="field-label" style={{ color: 'var(--text-muted)', textTransform: 'none', marginBottom: '2rem' }}>Please enter the secret password to access the API Library.</p>
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
            {passError && <div className="error-message"><span>⚠️ {passError}</span></div>}
            <button type="submit" className="btn-primary full-width" style={{ marginTop: '2rem' }}>Unlock Library</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span className="badge-ticket" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              Total: {artifacts.length}
            </span>
            {selectedIds.length === 2 && (
              <button
                className="btn-primary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', width: 'auto', flex: 'none' }}
                onClick={handleCompare}
              >
                ↔ Compare ({selectedIds.length})
              </button>
            )}
            <button
              style={{
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '0.75rem', padding: '0.5rem 1rem', cursor: 'pointer',
                color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600, width: 'auto', flex: 'none'
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
            placeholder="Search by API Name or Jira Ticket..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ fontSize: '1.1rem', padding: '1.25rem' }}
          />
        </div>

        <div className="scrollable" style={{ flex: 1, minHeight: 0 }}>
          {loading ? (
            <div className="loading-state" style={{ textAlign: 'center', padding: '4rem' }}>
              <div className="loader" style={{ margin: '0 auto' }}></div>
              <p style={{ marginTop: '1.5rem', color: 'var(--text-muted)' }}>Loading library...</p>
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
                      <tr key={art.id} style={{ cursor: 'pointer' }} onClick={() => toggleSelect(art.id)}>
                        <td onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(art.id)}
                            onChange={() => toggleSelect(art.id)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                          />
                        </td>
                        <td>{index + 1}</td>
                        <td style={{ fontWeight: 600 }}>{art.apiName}</td>
                        <td><span className="badge-env" data-env={art.env}>{art.env || 'DEV'}</span></td>
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
                          {art.timestamp?.toDate ? art.timestamp.toDate().toLocaleString('en-IN', { dateStyle: 'medium' }) : 'Unknown'}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
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
                              {downloadingStatus[art.id] ? <div className="loader tiny"></div> : '📦'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No results found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {compareArtifacts && (
        <ArtifactComparator
          artifactA={compareArtifacts.artifactA}
          artifactB={compareArtifacts.artifactB}
          onClose={() => { setCompareArtifacts(null); setSelectedIds([]); }}
        />
      )}

      {showInsights && (
        <LibraryInsights onClose={() => setShowInsights(false)} />
      )}
    </div>
  );
};

export default LibraryPage;
