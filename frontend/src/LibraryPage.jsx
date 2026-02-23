import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Link } from 'react-router-dom';
import { generateAndDownloadZip } from './artifactUtil';
import { decrypt, decryptCBC } from './cryptoUtil';

const LibraryPage = () => {
  const [artifacts, setArtifacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'artifacts'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Snapshot received. Items: ${snapshot.size}, From Cache: ${snapshot.metadata.fromCache}`);
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setArtifacts(docs);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error.code, error.message);
      if (error.code === 'permission-denied') {
        alert("Firestore Permission Denied. Please check your rules in the Firebase Console and set them to Test Mode.");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
      // The stored artifact has all the fields needed
      await generateAndDownloadZip([art], decrypt, decryptCBC);
    } catch (err) {
      console.error("Re-download failed:", err);
      alert("Re-download failed: " + err.message);
    } finally {
      setDownloadingStatus(prev => ({ ...prev, [art.id]: false }));
    }
  };

  return (
    <div className="library-container">
      <div className="library-header">
        <Link to="/" className="back-link">← Back to Tool</Link>
        <h1>API Artifact Library</h1>
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search by API Name or Jira Ticket..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="library-content card full-width">
        {loading ? (
          <div className="loading-state">
            <div className="loader"></div>
            <p>Loading library...</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="api-table">
              <thead>
                <tr>
                  <th>Sr. No.</th>
                  <th>API NAME</th>
                  <th>ENV</th>
                  <th>JIRA TICKET</th>
                  <th>Date</th>
                  <th>CURL / ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredArtifacts.length > 0 ? (
                  filteredArtifacts.map((art, index) => (
                    <tr key={art.id}>
                      <td>{index + 1}</td>
                      <td><strong>{art.apiName}</strong></td>
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
                      <td className="date-cell">
                        {art.timestamp?.toDate ? art.timestamp.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : new Date(art.timestamp).toLocaleString()}
                      </td>
                      <td>
                        <div className="action-cell">
                          <div className="curl-cell" title={art.curl}>
                            {art.curl?.substring(0, 40)}...
                          </div>
                          <button
                            className={`copy-icon-btn ${copyStatus[art.id] ? 'copied' : ''}`}
                            onClick={() => handleCopyCurl(art.id, art.curl)}
                            title="Copy full curl"
                          >
                            {copyStatus[art.id] ? '✓' : '📋'}
                          </button>
                          <button
                            className="copy-icon-btn download-btn"
                            onClick={() => handleDownload(art)}
                            disabled={downloadingStatus[art.id]}
                            title="Re-download Artifacts ZIP"
                          >
                            {downloadingStatus[art.id] ? <div className="loader tiny"></div> : '📦'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="empty-state">No artifacts found matching your search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryPage;
