import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Link } from 'react-router-dom';
import { generateAndDownloadZip } from './artifactUtil';
import { decrypt, decryptCBC } from './cryptoUtil';

const LibraryPage = ({ theme, toggleTheme }) => {
  const [artifacts, setArtifacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem('lib_auth') === 'true'
  );
  const [password, setPassword] = useState('');
  const [passError, setPassError] = useState('');

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

  const [copyStatus, setCopyStatus] = useState({}); // { id: boolean }
  const [downloadingStatus, setDownloadingStatus] = useState({}); // { id: boolean }

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
          <div className="badge-ticket" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            Total Items: {artifacts.length}
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
                      <tr key={art.id}>
                        <td>{index + 1}</td>
                        <td style={{ color: 'white', fontWeight: 600 }}>{art.apiName}</td>
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
                        <td>
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
                      <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No results found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryPage;
