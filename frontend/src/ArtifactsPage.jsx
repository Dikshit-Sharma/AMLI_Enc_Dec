import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { logAnalyticsEvent } from './firebase';
import { fetchArtifacts, addArtifacts } from './api';
import { decrypt, decryptCBC } from './cryptoUtil';
import { generateAndDownloadZip, generateArtifactText } from './artifactUtil';
import ArtifactAuditor from './ArtifactAuditor';
import useSmartPaste from './SmartPaste';
import { validateCurl } from './curlUtil';

function emptyArtifact() {
  return { jiraTicket: '', apiName: '', env: 'DEV', curl: '', response: '', encryption: 'Disabled', aesKey: '', algo: 'GCM', numRequests: 1, extraRequests: [] };
}

function validateArtifact(art) {
  const errors = [];
  if (!/^SOA-\d+$/.test(art.jiraTicket)) errors.push('jiraTicket');
  if (!art.apiName.trim()) errors.push('apiName');
  if (!art.curl.trim()) errors.push('curl');
  if (!art.response.trim()) errors.push('response');
  if (art.encryption === 'Enabled' && !art.aesKey.trim()) errors.push('aesKey');
  return errors;
}

export default function ArtifactsPage({ theme, toggleTheme }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [artifacts, setArtifacts] = useState([emptyArtifact()]);
  const [activeTab, setActiveTab] = useState(0);
  const [auditIndex, setAuditIndex] = useState(null);
  const [libraryForPaste, setLibraryForPaste] = useState([]);
  const [maskedPreviews, setMaskedPreviews] = useState({});
  const [dragIdx, setDragIdx] = useState(null);
  const tabRefs = useRef({});
  const generatingRef = useRef(false);
  const [curlErrors, setCurlErrors] = useState({});
  const [curlValidMsg, setCurlValidMsg] = useState({});
  const curlValTimers = useRef({});

  const pasteSuggestion = useSmartPaste(libraryForPaste);

  React.useEffect(() => {
    fetchArtifacts({ limit: 50 }).then(r => setLibraryForPaste(r.artifacts)).catch(() => {});
  }, []);

  const updateArtifact = (index, field, value) => {
    setArtifacts(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRequestCountChange = (artifactIndex, count) => {
    const newCount = parseInt(count);
    setArtifacts(prev => {
      const next = [...prev];
      const art = next[artifactIndex];
      const oldNum = art.numRequests;
      art.numRequests = newCount;
      if (newCount > oldNum) {
        for (let i = oldNum; i < newCount; i++) art.extraRequests.push({ request: '', response: '' });
      } else {
        art.extraRequests = art.extraRequests.slice(0, newCount - 1);
      }
      return next;
    });
  };

  const updateExtraRequest = (artifactIndex, extraIndex, field, value) => {
    setArtifacts(prev => {
      const next = [...prev];
      next[artifactIndex].extraRequests[extraIndex] = { ...next[artifactIndex].extraRequests[extraIndex], [field]: value };
      return next;
    });
  };

  const addTab = () => {
    setArtifacts(prev => [...prev, emptyArtifact()]);
    setActiveTab(artifacts.length);
  };

  const removeTab = (idx) => {
    if (artifacts.length <= 1) return;
    setArtifacts(prev => prev.filter((_, i) => i !== idx));
    if (activeTab >= idx) setActiveTab(prev => Math.max(0, prev - 1));
  };

  const handleDragStart = (idx) => { setDragIdx(idx); };
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setArtifacts(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const pushToLibrary = async (artifactsToPush) => {
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Database write timed out')), 5000));
      await Promise.race([addArtifacts(artifactsToPush), timeoutPromise]);
    } catch (e) { console.error('Error adding to library: ', e); }
  };

  const handleGenerateArtifacts = async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setError('');
    for (let i = 0; i < artifacts.length; i++) {
      const errs = validateArtifact(artifacts[i]);
      if (errs.length > 0) {
        setError(`Artifact ${i + 1}: Missing or invalid fields (${errs.join(', ')})`);
        setActiveTab(i);
        generatingRef.current = false;
        return;
      }
    }
    setLoading(true);
    try {
      await generateAndDownloadZip(artifacts, decrypt, decryptCBC);
      await pushToLibrary(artifacts);
      logAnalyticsEvent('generate_artifacts', { count: artifacts.length });
    } catch (err) { setError('Generation failed: ' + err.message); }
    finally { setLoading(false); generatingRef.current = false; }
  };

  const runCurlValidation = useCallback(function(index, curlValue) {
    var errors = validateCurl(curlValue);
    setCurlErrors(function(prev) { var n = { ...prev }; if (errors.length > 0) { n[index] = errors; } else { delete n[index]; } return n; });
    if (errors.length === 0 && curlValue.trim()) {
      setCurlValidMsg(function(prev) { return { ...prev, [index]: 'No issues found' }; });
      setTimeout(function() { setCurlValidMsg(function(prev) { var n = { ...prev }; delete n[index]; return n; }); }, 2500);
    } else {
      setCurlValidMsg(function(prev) { var n = { ...prev }; delete n[index]; return n; });
    }
  }, []);

  const handleCurlChange = useCallback(function(index, value, onChangeCb) {
    onChangeCb(value);
    // Debounced auto-validation
    if (curlValTimers.current[index]) clearTimeout(curlValTimers.current[index]);
    curlValTimers.current[index] = setTimeout(function() { runCurlValidation(index, value); }, 600);
  }, [runCurlValidation]);

  const handleMaskedPreview = async (index) => {
    if (maskedPreviews[index]) {
      setMaskedPreviews(prev => ({ ...prev, [index]: null }));
      return;
    }
    try {
      const text = await generateArtifactText(artifacts[index], decrypt, decryptCBC, true);
      setMaskedPreviews(prev => ({ ...prev, [index]: text }));
    } catch (err) { setError('Preview failed: ' + err.message); }
  };

  return (
    <div className="container">
      <div className="card artifact-workspace workspace-fullscreen" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
          <Link to="/library" className="badge-ticket link" style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem' }}>📚 Library</Link>
        </div>

        <h1 style={{ marginTop: '1rem', flexShrink: 0 }}>ARTIFACTS GENERATOR</h1>
        <p className="field-label" style={{ color: 'var(--text-muted)', textTransform: 'none', fontSize: '1rem', flexShrink: 0 }}>
          Create structured documentation packages for SOA requests.
        </p>

        {error && <div className="error-message" style={{ flexShrink: 0 }}><span>⚠️ {error}</span></div>}

        {/* Tab Bar */}
        <div className="artifact-tab-bar">
          {artifacts.map((art, idx) => {
            const errors = validateArtifact(art);
            const isActive = idx === activeTab;
            const isDrag = idx === dragIdx;
            const name = art.apiName?.trim() ? art.apiName.trim().slice(0, 14) + (art.apiName.length > 14 ? '…' : '') : `Artifact ${idx + 1}`;
            return (
              <div
                key={idx}
                className={`artifact-tab ${isActive ? 'active' : ''} ${isDrag ? 'dragging' : ''}`}
                onClick={() => setActiveTab(idx)}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                ref={el => tabRefs.current[idx] = el}
              >
                <span className={`artifact-tab-status ${errors.length === 0 ? 'valid' : 'invalid'}`} title={errors.length > 0 ? `Missing: ${errors.join(', ')}` : 'Complete'} />
                <span className="artifact-tab-num">{idx + 1}</span>
                <span className="artifact-tab-name">{name}</span>
                {artifacts.length > 1 && (
                  <button className="artifact-tab-close" onClick={(e) => { e.stopPropagation(); removeTab(idx); }} title="Remove artifact">
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button className="artifact-tab-add" onClick={addTab} title="Add artifact">+</button>
        </div>

        {/* Artifact form — only active tab */}
        <div className="modal-body scrollable artifact-tab-content">
          {artifacts.map((art, index) => (
            <div key={index} style={{ display: index === activeTab ? 'block' : 'none' }}>
              <div className="form-row" style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                <button className="btn-sm-artifact-action" onClick={() => setAuditIndex(index)}>🔍 Audit</button>
                <button className={`btn-sm-artifact-action ${maskedPreviews[index] ? 'active' : ''}`} onClick={() => handleMaskedPreview(index)}>
                  👁️ Masked
                </button>
              </div>

              <div className="form-row">
                <div className="form-group flexify">
                  <label className="field-label">Jira Ticket</label>
                  <input type="text" className="main-input" placeholder="SOA-1234" value={art.jiraTicket}
                    onChange={(e) => updateArtifact(index, 'jiraTicket', e.target.value)} />
                </div>
                <div className="form-group flexify">
                  <label className="field-label">API Name</label>
                  <input type="text" className="main-input" placeholder="CreateOrder" value={art.apiName}
                    onChange={(e) => updateArtifact(index, 'apiName', e.target.value)} />
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
                <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  Curl Command
                  {curlValidMsg[index] && <span style={{ color: 'var(--success, #059669)', fontSize: '0.72rem', fontWeight: 600 }}>{curlValidMsg[index]} ✓</span>}
                </label>
                <textarea className={'main-input small-area' + ((curlErrors[index] && curlErrors[index].length > 0) ? ' input-error' : '')} placeholder="Paste full curl here..." value={art.curl}
                  onChange={(e) => {
                    handleCurlChange(index, e.target.value, function(val) {
                      updateArtifact(index, 'curl', val);
                      pasteSuggestion.handleCurlChange(val);
                    });
                  }} />
                {curlErrors[index] && curlErrors[index].length > 0 && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.75rem' }}>
                    {curlErrors[index].filter(function(e) { return e.type === 'error'; }).map(function(e, ei) {
                      return <div key={ei} style={{ color: 'var(--error, #dc2626)', padding: '0.1rem 0' }}>✗ L{e.line}: {e.message}</div>;
                    })}
                    {curlErrors[index].filter(function(e) { return e.type === 'warning'; }).map(function(e, ei) {
                      return <div key={ei} style={{ color: 'var(--warning, #d97706)', padding: '0.1rem 0' }}>⚠ L{e.line}: {e.message}</div>;
                    })}
                  </div>
                )}
                {pasteSuggestion.suggestion && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Detected: {pasteSuggestion.suggestion.apiName && `API: ${pasteSuggestion.suggestion.apiName}`}
                      {pasteSuggestion.suggestion.env && ` · Env: ${pasteSuggestion.suggestion.env}`}
                      {pasteSuggestion.suggestion.match && ` · Matched: ${pasteSuggestion.suggestion.match.apiName}`}
                    </span>
                    <button className="btn-sm-primary" onClick={() => pasteSuggestion.applySuggestion((field, val) => updateArtifact(index, field, val))}>
                      Apply
                    </button>
                    <button className="btn-sm-ghost" onClick={pasteSuggestion.dismissSuggestion}>
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="field-label">Response JSON</label>
                <textarea className="main-input small-area" placeholder="Paste response here..." value={art.response}
                  onChange={(e) => updateArtifact(index, 'response', e.target.value)} />
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
                    <textarea className="main-input small-area" placeholder={`Request ${eIdx + 2}...`} value={extra.request}
                      onChange={(e) => updateExtraRequest(index, eIdx, 'request', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="field-label">Response {eIdx + 2}</label>
                    <textarea className="main-input small-area" placeholder={`Response ${eIdx + 2}...`} value={extra.response}
                      onChange={(e) => updateExtraRequest(index, eIdx, 'response', e.target.value)} />
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
                      <input type="text" className="main-input" placeholder="Key" value={art.aesKey}
                        onChange={(e) => updateArtifact(index, 'aesKey', e.target.value)} />
                    </div>
                  </>
                )}
              </div>

              {maskedPreviews[index] && (
                <div className="masked-preview-box">
                  <label className="field-label" style={{ marginBottom: '0.5rem' }}>🔍 Masked Preview</label>
                  <textarea className="main-input small-area" readOnly value={maskedPreviews[index]}
                    style={{ minHeight: '150px', fontSize: '0.8rem', fontFamily: 'monospace', resize: 'vertical' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="artifacts-actions-centered" style={{ flexShrink: 0 }}>
          <button className="btn-primary btn-sm-artifacts" onClick={handleGenerateArtifacts} disabled={loading}>
            {loading ? <div className="loader tiny" /> : '🚀 Generate & Download Artifacts'}
          </button>
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

      <footer className="footer-minimal">
        <p>Built by <strong>Dikshit Sharma</strong> | <a href="mailto:dikshit.sharma2580@gmail.com">dikshit.sharma2580@gmail.com</a></p>
      </footer>
    </div>
  );
}
