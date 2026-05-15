import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { logAnalyticsEvent } from './firebase';
import { fetchArtifacts, addArtifacts } from './api';
import { decrypt, decryptCBC } from './cryptoUtil';
import { generateAndDownloadZip, generateArtifactText } from './artifactUtil';
import ArtifactAuditor from './ArtifactAuditor';
import useSmartPaste from './SmartPaste';

export default function ArtifactsPage({ theme, toggleTheme }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [numArtifacts, setNumArtifacts] = useState(1);
  const [artifacts, setArtifacts] = useState([
    { jiraTicket: '', apiName: '', env: 'DEV', curl: '', response: '', encryption: 'Disabled', aesKey: '', algo: 'GCM', numRequests: 1, extraRequests: [] }
  ]);
  const [auditIndex, setAuditIndex] = useState(null);
  const [libraryForPaste, setLibraryForPaste] = useState([]);
  const [maskedPreviews, setMaskedPreviews] = useState({});

  const pasteSuggestion = useSmartPaste(libraryForPaste);

  React.useEffect(() => {
    const loadLibrary = async () => {
      try {
        const res = await fetchArtifacts();
        setLibraryForPaste(res.artifacts);
      } catch { /* library load is non-critical */ }
    };
    loadLibrary();
  }, []);

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
      await Promise.race([addArtifacts(artifactsToPush), timeoutPromise]);
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

  const handleMaskedPreview = async (index) => {
    if (maskedPreviews[index]) {
      setMaskedPreviews(prev => ({ ...prev, [index]: null }));
      return;
    }
    try {
      const text = await generateArtifactText(artifacts[index], decrypt, decryptCBC, true);
      setMaskedPreviews(prev => ({ ...prev, [index]: text }));
    } catch (err) {
      setError('Preview failed: ' + err.message);
    }
  };
  return (
    <div className="container">
      <div className="card artifact-workspace workspace-fullscreen">
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

        <div className="modal-body scrollable" style={{ flex: 1, minHeight: 0, marginTop: '1.5rem', paddingRight: '1rem', paddingBottom: '3rem' }}>
          {error && <div className="error-message"><span>⚠️ {error}</span></div>}

          <div className="form-group" style={{ maxWidth: '300px' }}>
            <label className="field-label">Number of Files</label>
            <select className="custom-select" value={numArtifacts} onChange={(e) => handleArtifactCountChange(e.target.value)}>
              {Array.from({ length: 15 }, (_, i) => i + 1).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {artifacts.map((art, index) => (
            <div key={index} className="artifact-group-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="artifact-title" style={{ margin: 0 }}>Artifact {index + 1}</h3>
                <button
                  style={{
                    background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: '0.75rem', padding: '0.4rem 1rem', cursor: 'pointer',
                    color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600, width: 'auto', flex: 'none'
                  }}
                  onClick={() => setAuditIndex(index)}
                >
                  🔍 Audit
                </button>
                <button
                  style={{
                    background: maskedPreviews[index] ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${maskedPreviews[index] ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '0.75rem', padding: '0.4rem 1rem', cursor: 'pointer',
                    color: maskedPreviews[index] ? 'var(--success)' : 'var(--text-muted)',
                    fontSize: '0.8rem', fontWeight: 600, width: 'auto', flex: 'none'
                  }}
                  onClick={() => handleMaskedPreview(index)}
                >
                  👁️ Masked
                </button>
              </div>
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
                <textarea className="main-input small-area" placeholder="Paste full curl here..." value={art.curl} onChange={(e) => {
                  updateArtifact(index, 'curl', e.target.value);
                  pasteSuggestion.handleCurlChange(e.target.value);
                }} />
                {pasteSuggestion.suggestion && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Detected: {pasteSuggestion.suggestion.apiName && `API: ${pasteSuggestion.suggestion.apiName}`}
                      {pasteSuggestion.suggestion.env && ` · Env: ${pasteSuggestion.suggestion.env}`}
                      {pasteSuggestion.suggestion.match && ` · Matched: ${pasteSuggestion.suggestion.match.apiName}`}
                    </span>
                    <button style={{ background: 'var(--primary)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer', color: 'white', width: 'auto' }} onClick={() => pasteSuggestion.applySuggestion((field, val) => updateArtifact(index, field, val))}>
                      Apply
                    </button>
                    <button style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text)', width: 'auto' }} onClick={pasteSuggestion.dismissSuggestion}>
                      Dismiss
                    </button>
                  </div>
                )}
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
              {maskedPreviews[index] && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '1rem' }}>
                  <label className="field-label" style={{ marginBottom: '0.5rem' }}>🔍 Masked Preview</label>
                  <textarea className="main-input small-area" readOnly value={maskedPreviews[index]} style={{ minHeight: '150px', fontSize: '0.8rem', fontFamily: 'monospace', resize: 'vertical' }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {auditIndex !== null && (
        <ArtifactAuditor
          artifact={artifacts[auditIndex]}
          onClose={() => setAuditIndex(null)}
          onJumpToField={(field) => {
            const el = document.querySelector(`[name="art-${auditIndex}-${field}"]`);
            if (el) el.focus();
          }}
        />
      )}

      <div className="artifacts-actions-centered">
        <button className="btn-primary btn-sm-artifacts" onClick={handleGenerateArtifacts} disabled={loading}>
          {loading ? <div className="loader tiny"></div> : '🚀 Generate & Download Artifacts'}
        </button>
      </div>
      <footer className="footer-minimal">
        <p>Built by <strong>Dikshit Sharma</strong> | <a href="mailto:dikshit.sharma2580@gmail.com">dikshit.sharma2580@gmail.com</a></p>
      </footer>
    </div>
  );
}
