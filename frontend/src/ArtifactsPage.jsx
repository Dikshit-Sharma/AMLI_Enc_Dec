import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, logAnalyticsEvent } from './firebase';
import { decrypt, decryptCBC } from './cryptoUtil';
import { generateAndDownloadZip } from './artifactUtil';

export default function ArtifactsPage({ theme, toggleTheme }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [numArtifacts, setNumArtifacts] = useState(1);
  const [artifacts, setArtifacts] = useState([
    { jiraTicket: '', apiName: '', env: 'DEV', curl: '', response: '', encryption: 'Disabled', aesKey: '', algo: 'GCM', numRequests: 1, extraRequests: [] }
  ]);

  const handleArtifactCountChange = (count) => {
    const newCount = parseInt(count);
    setNumArtifacts(newCount);
    setArtifacts(prev => {
      const newArtifacts = [...prev];
      if (newCount > prev.length) {
        for (let i = prev.length; i < newCount; i++) {
          newArtifacts.push({ jiraTicket: '', apiName: '', env: 'DEV', curl: '', response: '', encryption: 'Disabled', aesKey: '', algo: 'GCM', numRequests: 1, extraRequests: [] });
        }
      } else {
        return newArtifacts.slice(0, newCount);
      }
      return newArtifacts;
    });
  };

  const updateArtifact = (index, field, value) => {
    setArtifacts(prev => {
      const newArtifacts = [...prev];
      newArtifacts[index] = { ...newArtifacts[index], [field]: value };
      return newArtifacts;
    });
  };

  const handleRequestCountChange = (artifactIndex, count) => {
    const newCount = parseInt(count);
    setArtifacts(prev => {
      const newArtifacts = [...prev];
      const art = newArtifacts[artifactIndex];
      const oldNum = art.numRequests;
      art.numRequests = newCount;
      if (newCount > oldNum) {
        for (let i = oldNum; i < newCount; i++) {
          art.extraRequests.push({ request: '', response: '' });
        }
      } else {
        art.extraRequests = art.extraRequests.slice(0, newCount - 1);
      }
      return newArtifacts;
    });
  };

  const updateExtraRequest = (artifactIndex, extraIndex, field, value) => {
    setArtifacts(prev => {
      const newArtifacts = [...prev];
      const art = newArtifacts[artifactIndex];
      art.extraRequests[extraIndex] = { ...art.extraRequests[extraIndex], [field]: value };
      return newArtifacts;
    });
  };

  const pushToLibrary = async (artifactsToPush) => {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database write timed out")), 5000)
      );
      for (const art of artifactsToPush) {
        const writePromise = addDoc(collection(db, 'artifacts'), {
          ...art,
          timestamp: serverTimestamp()
        });
        await Promise.race([writePromise, timeoutPromise]);
      }
    } catch (e) {
      console.error("Error adding to library: ", e);
    }
  };

  const handleGenerateArtifacts = async () => {
    setError('');
    const jiraRegex = /^SOA-\d+$/;
    for (let i = 0; i < artifacts.length; i++) {
      const art = artifacts[i];
      if (!jiraRegex.test(art.jiraTicket)) {
        setError(`Artifact ${i + 1}: Invalid Jira Ticket format (expected SOA-XXXX)`);
        return;
      }
      if (!art.apiName.trim() || !art.curl.trim() || !art.response.trim()) {
        setError(`Artifact ${i + 1}: All fields are mandatory`);
        return;
      }
      if (art.encryption === 'Enabled' && !art.aesKey.trim()) {
        setError(`Artifact ${i + 1}: AES Key is mandatory when encryption is enabled`);
        return;
      }
    }
    setLoading(true);
    try {
      await generateAndDownloadZip(artifacts, decrypt, decryptCBC);
      await pushToLibrary(artifacts);
      logAnalyticsEvent('generate_artifacts', { count: artifacts.length });
    } catch (err) {
      setError('Generation failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card artifact-workspace">
        <div className="modal-header">
          <div className="top-nav-row" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
              <button className="theme-toggle" onClick={toggleTheme}>
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
            </div>
            <Link to="/library" className="badge-ticket link" style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem' }}>📚 Library</Link>
          </div>
          <h1 style={{ marginTop: '1rem' }}>ARTIFACTS GENERATOR</h1>
          <p className="field-label" style={{ color: 'var(--text-muted)', textTransform: 'none', fontSize: '1rem' }}>Create structured documentation packages for SOA requests.</p>
        </div>

        <div className="modal-body scrollable" style={{ flex: 1, minHeight: 0, marginTop: '1.5rem', paddingRight: '1rem' }}>
          {error && <div className="error-message"><span>⚠️ {error}</span></div>}

          <div className="form-group" style={{ maxWidth: '300px' }}>
            <label className="field-label">Number of Files</label>
            <select className="custom-select" value={numArtifacts} onChange={(e) => handleArtifactCountChange(e.target.value)}>
              {Array.from({ length: 15 }, (_, i) => i + 1).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {artifacts.map((art, index) => (
            <div key={index} className="artifact-group-card">
              <h3 className="artifact-title">Artifact {index + 1}</h3>
              <div className="form-row">
                <div className="form-group flexify">
                  <label className="field-label">Jira Ticket</label>
                  <input type="text" className="main-input" placeholder="SOA-1234" value={art.jiraTicket} onChange={(e) => updateArtifact(index, 'jiraTicket', e.target.value)} />
                </div>
                <div className="form-group flexify">
                  <label className="field-label">API Name</label>
                  <input type="text" className="main-input" placeholder="CreateOrder" value={art.apiName} onChange={(e) => updateArtifact(index, 'apiName', e.target.value)} />
                </div>
                <div className="form-group flexify">
                  <label className="field-label">ENV</label>
                  <select className="custom-select" value={art.env} onChange={(e) => updateArtifact(index, 'env', e.target.value)}>
                    <option value="DEV">DEV</option>
                    <option value="UAT">UAT</option>
                    <option value="PROD">PROD</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="field-label">Curl Command</label>
                <textarea className="main-input small-area" placeholder="Paste full curl here..." value={art.curl} onChange={(e) => updateArtifact(index, 'curl', e.target.value)} />
              </div>

              <div className="form-group">
                <label className="field-label">Response JSON</label>
                <textarea className="main-input small-area" placeholder="Paste response here..." value={art.response} onChange={(e) => updateArtifact(index, 'response', e.target.value)} />
              </div>

              <div className="form-group" style={{ maxWidth: '300px' }}>
                <label className="field-label">Requests in this File</label>
                <select className="custom-select" value={art.numRequests} onChange={(e) => handleRequestCountChange(index, e.target.value)}>
                  {Array.from({ length: 15 }, (_, i) => i + 1).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              {art.extraRequests.map((extra, eIdx) => (
                <div key={eIdx} className="extra-request-group">
                  <div className="form-group">
                    <label className="field-label">Request {eIdx + 2}</label>
                    <textarea className="main-input small-area" placeholder={`Request ${eIdx + 2}...`} value={extra.request} onChange={(e) => updateExtraRequest(index, eIdx, 'request', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="field-label">Response {eIdx + 2}</label>
                    <textarea className="main-input small-area" placeholder={`Response ${eIdx + 2}...`} value={extra.response} onChange={(e) => updateExtraRequest(index, eIdx, 'response', e.target.value)} />
                  </div>
                </div>
              ))}

              <div className="form-row">
                <div className="form-group flexify">
                  <label className="field-label">Encryption</label>
                  <select className="custom-select" value={art.encryption} onChange={(e) => updateArtifact(index, 'encryption', e.target.value)}>
                    <option value="Disabled">Disabled</option>
                    <option value="Enabled">Enabled</option>
                  </select>
                </div>
                {art.encryption === 'Enabled' && (
                  <>
                    <div className="form-group flexify">
                      <label className="field-label">Mode</label>
                      <select className="custom-select" value={art.algo} onChange={(e) => updateArtifact(index, 'algo', e.target.value)}>
                        <option value="GCM">AES/GCM</option>
                        <option value="CBC">AES/CBC</option>
                      </select>
                    </div>
                    <div className="form-group flexify">
                      <label className="field-label">AES Key</label>
                      <input type="text" className="main-input" placeholder="Key" value={art.aesKey} onChange={(e) => updateArtifact(index, 'aesKey', e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>
      <div className="artifacts-actions-centered" style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
        <button className="btn-primary" onClick={handleGenerateArtifacts} disabled={loading} style={{ padding: '1.25rem 3rem', width: 'auto' }}>
          {loading ? <div className="loader"></div> : '🚀 Generate & Download Artifacts'}
        </button>
      </div>
    </div>
  );
}
