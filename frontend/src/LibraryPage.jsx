import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Link } from 'react-router-dom';

const LibraryPage = () => {
  const [artifacts, setArtifacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'artifacts'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setArtifacts(docs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching artifacts:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredArtifacts = artifacts.filter(art =>
    art.apiName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    art.jiraTicket?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                  <th>JIRA TICKET</th>
                  <th>Date</th>
                  <th>CURL</th>
                </tr>
              </thead>
              <tbody>
                {filteredArtifacts.length > 0 ? (
                  filteredArtifacts.map((art, index) => (
                    <tr key={art.id}>
                      <td>{index + 1}</td>
                      <td><strong>{art.apiName}</strong></td>
                      <td><span className="badge-ticket">{art.jiraTicket}</span></td>
                      <td>{art.timestamp?.toDate ? art.timestamp.toDate().toLocaleString() : new Date(art.timestamp).toLocaleString()}</td>
                      <td>
                        <div className="curl-cell" title={art.curl}>
                          {art.curl?.substring(0, 50)}...
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
