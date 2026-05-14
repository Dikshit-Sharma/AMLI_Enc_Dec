import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchCredentials, addCredential, deleteCredential, fetchArtifacts } from './api';

const ENVS = ['DEV', 'UAT', 'PROD'];

const CREDENTIAL_KEYS = [
  'x-api-key', 'x-apigw-api-id', 'xapigwapiid',
  'clientid', 'client_id', 'client-id',
  'clientsecret', 'client_secret', 'client-secret',
  'appid', 'soaappid',
];

function parseCurlForHeaders(curlString) {
  const headers = {};
  if (!curlString) return headers;
  const headerRegex = /-(?:H|-header)\s+["']([^"']+)["']/g;
  let match;
  while ((match = headerRegex.exec(curlString)) !== null) {
    const [key, ...values] = match[1].split(':');
    if (key && values.length) {
      headers[key.trim()] = values.join(':').trim();
    }
  }
  return headers;
}

function parseCurlBody(curlString) {
  if (!curlString) return null;
  const bodyMatch = curlString.match(/-(?:d|-data(?:-raw)?)\s+["']({[\s\S]+?})["']/);
  if (!bodyMatch) return null;
  try {
    return JSON.parse(bodyMatch[1]);
  } catch {
    return null;
  }
}

function findCredentialsInObject(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return {};
  const found = {};
  for (const [key, value] of Object.entries(obj)) {
    const lk = key.toLowerCase();
    if (typeof value === 'string' && value.length > 0) {
      for (const ck of CREDENTIAL_KEYS) {
        if (lk === ck) {
          found[ck] = value;
        }
      }
    }
    if (typeof value === 'object') {
      const nested = findCredentialsInObject(value, depth + 1);
      Object.assign(found, nested);
    }
  }
  return found;
}

function tryParseJson(str) {
  if (!str || typeof str !== 'string') return null;
  try { return JSON.parse(str); } catch { return null; }
}

function extractFromArtifact(art) {
  if (!art.env) return null;

  const found = {};

  const headers = parseCurlForHeaders(art.curl);
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    for (const ck of CREDENTIAL_KEYS) {
      if (lk === ck) found[ck] = v;
    }
  }

  const body = parseCurlBody(art.curl);
  if (body) {
    Object.assign(found, findCredentialsInObject(body));
  }

  const responseObj = tryParseJson(art.response);
  if (responseObj) {
    Object.assign(found, findCredentialsInObject(responseObj));
  }

  if (Array.isArray(art.extraRequests)) {
    for (const extra of art.extraRequests) {
      if (extra.response) {
        const extraRes = tryParseJson(extra.response);
        if (extraRes) Object.assign(found, findCredentialsInObject(extraRes));
      }
    }
  }

  const xApiKey = found['x-api-key'] || found['x-apigw-api-id'] || found['xapigwapiid'] || '';
  const clientId = found['clientid'] || found['client_id'] || found['client-id'] || '';
  const clientSecret = found['clientsecret'] || found['client_secret'] || found['client-secret'] || '';
  const aesKey = art.aesKey || found['aeskey'] || '';

  if (!xApiKey && !clientId && !clientSecret && !aesKey) return null;

  return {
    id: `art_${art.id}`,
    soaAppId: art.jiraTicket || 'Unknown',
    apiName: art.apiName || '',
    env: art.env,
    xApiKey,
    clientId,
    clientSecret,
    aesKey,
    _source: 'artifact',
  };
}

function deduplicate(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = `${item.xApiKey}|${item.clientId}|${item.clientSecret}|${item.aesKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

  const LIB_PASSWORD = import.meta.env.VITE_LIBRARY_PASSWORD || "*******************";

  const loadAll = async () => {
    setLoading(true);
    try {
      const [manualRes, artRes] = await Promise.all([
        Promise.all(ENVS.map((env) => fetchCredentials(env).then((r) => [env, r.credentials || []]))),
        fetchArtifacts(),
      ]);

      const manual = Object.fromEntries(manualRes);
      const extracted = {};
      for (const env of ENVS) extracted[env] = [];

      for (const art of artRes.artifacts || []) {
        const entry = extractFromArtifact(art);
        if (entry && ENVS.includes(entry.env)) {
          extracted[entry.env].push(entry);
        }
      }

      const grouped = {};
      for (const env of ENVS) {
        grouped[env] = deduplicate([...(manual[env] || []), ...extracted[env]]);
      }

      setAllCreds(grouped);
      console.log(`Loaded ${artRes?.artifacts?.length || 0} artifacts, extracted credentials per env:`, Object.fromEntries(ENVS.map(e => [e, extracted[e]?.length || 0])));
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
          <Link to="/library" className="back-link">← Back to Library</Link>
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

  const creds = allCreds[activeEnv] || [];

  return (
    <div className="container">
      <div className="card">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/library" className="back-link" style={{ marginBottom: 0 }}>← Back to Library</Link>
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

        <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
          {creds.length} unique entr{creds.length === 1 ? 'y' : 'ies'} in {activeEnv}
        </div>

        {expandForm && <AddForm env={activeEnv} onAdded={() => { loadAll(); setExpandForm(false); }} />}

        {loading ? (
          <div className="loading-state" style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="loader" style={{ margin: '0 auto' }}></div>
            <p style={{ marginTop: '1.5rem', color: 'var(--text-muted)' }}>Loading credentials...</p>
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
                {creds.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{c.soaAppId}</td>
                    <td>{c.apiName || '--'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {c.xApiKey ? `${c.xApiKey.slice(0, 8)}...` : '--'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {c.clientId ? `${c.clientId.slice(0, 8)}...` : '--'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {c.clientSecret ? '••••••••' : '--'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {c.aesKey ? `${c.aesKey.slice(0, 8)}...` : '--'}
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
                      <button
                        className="copy-icon-btn"
                        onClick={() => handleDelete(c.id)}
                        disabled={deleting === c.id}
                        title={c._source === 'artifact' ? 'From artifact' : 'Delete'}
                        style={{ color: c._source === 'artifact' ? 'var(--text-muted)' : 'var(--error)', borderColor: 'rgba(244,63,94,0.3)' }}
                      >
                        {deleting === c.id ? <div className="loader tiny" /> : '🗑'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
