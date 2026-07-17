import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchCredentials, addCredential, deleteCredential, fetchExtractedCredentials } from './api';
import { SkeletonTableRows } from './Skeleton';
import { deduplicate } from './credentialExtract';

const ENVS = ['DEV', 'UAT', 'PROD'];

function AddForm({ env, onAdded }) {
  const [form, setForm] = useState({
    soaAppId: '',
    apiName: '',
    xApiKey: '',
    clientId: '',
    clientSecret: '',
    aesKey: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.soaAppId.trim()) return;
    setSaving(true);
    try {
      await addCredential({ ...form, env });
      setForm({ soaAppId: '', apiName: '', xApiKey: '', clientId: '', clientSecret: '', aesKey: '' });
      onAdded();
    } catch (err) {
      alert('Failed to add: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.75rem',
        marginBottom: '1.5rem',
        padding: '1.5rem',
        background: 'var(--output-bg)',
        borderRadius: '1rem',
        border: '1px solid var(--border)',
      }}
    >
      <input
        className="main-input"
        placeholder="SOA App ID *"
        value={form.soaAppId}
        onChange={(e) => setForm({ ...form, soaAppId: e.target.value })}
        required
      />
      <input
        className="main-input"
        placeholder="API Name"
        value={form.apiName}
        onChange={(e) => setForm({ ...form, apiName: e.target.value })}
      />
      <input
        className="main-input"
        placeholder="x-api-key"
        value={form.xApiKey}
        onChange={(e) => setForm({ ...form, xApiKey: e.target.value })}
      />
      <input
        className="main-input"
        placeholder="Client ID"
        value={form.clientId}
        onChange={(e) => setForm({ ...form, clientId: e.target.value })}
      />
      <input
        className="main-input"
        placeholder="Client Secret"
        value={form.clientSecret}
        onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
      />
      <input
        className="main-input"
        placeholder="AES Key"
        value={form.aesKey}
        onChange={(e) => setForm({ ...form, aesKey: e.target.value })}
      />
      <button
        type="submit"
        className="btn-primary"
        disabled={saving}
        style={{ gridColumn: '1 / -1', width: '100%' }}
      >
        {saving ? <div className="loader tiny" /> : '+ Add Credential'}
      </button>
    </form>
  );
}

export default function CredentialsPage({ theme, toggleTheme }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem('cred_auth') === 'true'
  );
  const [password, setPassword] = useState('');
  const [passError, setPassError] = useState('');
  const [activeEnv, setActiveEnv] = useState('DEV');
  const [allCreds, setAllCreds] = useState({ DEV: [], UAT: [], PROD: [] });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [expandForm, setExpandForm] = useState(false);
  const [revealedIds, setRevealedIds] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);
  const [credSearch, setCredSearch] = useState('');

  const LIB_PASSWORD = import.meta.env.VITE_LIBRARY_PASSWORD || "*******************";

  const loadAll = async () => {
    setLoading(true);
    try {
      const [manualRes, extractedRes] = await Promise.all([
        Promise.all(ENVS.map((env) => fetchCredentials(env).then((r) => [env, r.credentials || []]))),
        fetchExtractedCredentials(),
      ]);

      const manual = Object.fromEntries(manualRes);
      const extracted = extractedRes.credentials || {};

      const grouped = {};
      for (const env of ENVS) {
        grouped[env] = deduplicate([...(manual[env] || []), ...extracted[env]]);
      }

      setAllCreds(grouped);
      console.log(`Server extracted credentials per env:`, Object.fromEntries(ENVS.map(e => [e, extracted[e]?.length || 0])));
    } catch (err) {
      console.error('Failed to load credentials:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) loadAll();
  }, [isAuthenticated]);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password === LIB_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('cred_auth', 'true');
      setPassError('');
    } else {
      setPassError('Incorrect password. Please try again.');
    }
  };

  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const copyCreds = async (c) => {
    const text = [
      `SOA App ID: ${c.soaAppId}`,
      `API Name: ${c.apiName || ''}`,
      `x-api-key: ${c.xApiKey}`,
      `Client ID: ${c.clientId}`,
      `Client Secret: ${c.clientSecret}`,
      `AES Key: ${c.aesKey}`,
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id) => {
    if (id.startsWith('art_')) {
      alert('This credential was extracted from an artifact. Delete the artifact in the Library to remove it.');
      return;
    }
    if (!window.confirm('Delete this credential entry?')) return;
    setDeleting(id);
    try {
      await deleteCredential(id);
      await loadAll();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="card" style={{ maxWidth: '500px', flex: 'none', height: 'auto' }}>
          <Link to="/" className="back-link">← Back (Home)</Link>
          <h2 style={{ marginTop: '1.5rem' }}>Credentials Protected</h2>
          <p className="field-label" style={{ color: 'var(--text-muted)', textTransform: 'none', marginBottom: '2rem' }}>
            Enter the library password to access stored credentials.
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
            {passError && <div className="error-message"><span>⚠️ {passError}</span></div>}
            <button type="submit" className="btn-primary full-width" style={{ marginTop: '2rem' }}>Unlock Credentials</button>
          </form>
        </div>
      </div>
    );
  }

  const creds = (allCreds[activeEnv] || []).filter((c) => {
    if (!credSearch) return true;
    const q = credSearch.toLowerCase();
    return c.soaAppId?.toLowerCase().includes(q) || c.apiName?.toLowerCase().includes(q);
  });

  return (
    <div className="container">
      <div className="card">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back (Home)</Link>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
          <button
            onClick={() => setExpandForm((p) => !p)}
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
          >
            {expandForm ? '✕ Close' : '+ New'}
          </button>
        </div>

        <h1>🔑 CREDENTIALS</h1>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', justifyContent: 'center' }}>
          {ENVS.map((env) => (
            <button
              key={env}
              onClick={() => setActiveEnv(env)}
              className={`toggle-btn ${activeEnv === env ? 'active' : ''}`}
              style={{
                flex: 'none',
                padding: '0.75rem 2rem',
                fontWeight: 700,
                fontSize: '1rem',
                borderRadius: '0.75rem',
                border: activeEnv === env ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: activeEnv === env ? 'var(--primary-glow)' : 'var(--input-bg)',
                color: activeEnv === env ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {env}
            </button>
          ))}
        </div>

        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            className="main-input"
            placeholder="Search by SOA App ID or API Name..."
            value={credSearch}
            onChange={(e) => setCredSearch(e.target.value)}
            style={{ fontSize: '0.95rem', padding: '0.75rem 1rem' }}
          />
        </div>

        <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
          {creds.length} unique entr{creds.length === 1 ? 'y' : 'ies'} in {activeEnv}
          {credSearch && ` matching "${credSearch}"`}
        </div>

        {expandForm && <AddForm env={activeEnv} onAdded={() => { loadAll(); setExpandForm(false); }} />}

        {loading ? (
          <div className="table-responsive">
            <table className="api-table">
              <thead>
                <tr>
                  <th>SOA App ID</th>
                  <th>API Name</th>
                  <th>x-api-key</th>
                  <th>Client ID</th>
                  <th>Client Secret</th>
                  <th>AES Key</th>
                  <th>Source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <SkeletonTableRows rows={6} cols={8} />
              </tbody>
            </table>
          </div>
        ) : creds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            No credentials found for {activeEnv}. Click "+ New" to add one manually.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="api-table">
              <thead>
                <tr>
                  <th>SOA App ID</th>
                  <th>API Name</th>
                  <th>x-api-key</th>
                  <th>Client ID</th>
                  <th>Client Secret</th>
                  <th>AES Key</th>
                  <th>Source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {creds.map((c) => {
                  const revealed = revealedIds.has(c.id);
                  const val = (v) => (v && revealed ? v : v ? `${v.slice(0, 8)}...` : '--');
                  const sec = (v) => (v && revealed ? v : v ? '••••••••' : '--');
                  return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{c.soaAppId}</td>
                    <td>{c.apiName || '--'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {val(c.xApiKey)}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {val(c.clientId)}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {sec(c.clientSecret)}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {val(c.aesKey)}
                    </td>
                    <td>
                      {c._source === 'artifact' ? (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--output-bg)', padding: '0.2rem 0.5rem', borderRadius: '0.3rem' }}>
                          artifact
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--primary)', background: 'var(--primary-glow)', padding: '0.2rem 0.5rem', borderRadius: '0.3rem' }}>
                          manual
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <button
                          className="copy-icon-btn"
                          onClick={() => toggleReveal(c.id)}
                          title={revealed ? 'Hide' : 'Show'}
                          style={{ color: revealed ? 'var(--primary)' : 'var(--text-muted)', borderColor: 'rgba(99,102,241,0.3)' }}
                        >
                          {revealed ? '👁' : '👁‍🗨'}
                        </button>
                        <button
                          className="copy-icon-btn"
                          onClick={() => copyCreds(c)}
                          title="Copy"
                          style={{ color: copiedId === c.id ? 'var(--success)' : 'var(--text-muted)', borderColor: 'rgba(99,102,241,0.3)' }}
                        >
                          {copiedId === c.id ? '✓' : '📋'}
                        </button>
                        <button
                          className="copy-icon-btn"
                          onClick={() => handleDelete(c.id)}
                          disabled={deleting === c.id}
                          title={c._source === 'artifact' ? 'From artifact' : 'Delete'}
                          style={{ color: c._source === 'artifact' ? 'var(--text-muted)' : 'var(--error)', borderColor: 'rgba(244,63,94,0.3)' }}
                        >
                          {deleting === c.id ? <div className="loader tiny" /> : '🗑'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
