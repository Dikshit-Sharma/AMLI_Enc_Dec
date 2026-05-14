import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './LocReport.css';

const STORAGE_KEY = 'locr_form';
const NETLIFY_PROXY = '/.netlify/functions/gitlab-proxy';
const LOCAL_PROXY = '/proxy';
const ON_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

function loadForm() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ void 0; }
  return {
    baseUrl: 'https://repo.maxlifeinsurance.com/api/v4',
    token: '',
    userId: '',
    startDate: '',
    endDate: '',
  };
}

function saveForm(form) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  } catch { /* ignore */ void 0; }
}

function formatNumber(n) {
  return n.toLocaleString('en-IN');
}

function sumKey(arr, key) {
  return arr.reduce((s, p) => s + (p[key] || 0), 0);
}

const MODE = { LOCAL: 0, NETLIFY: 1, CHECKING: 2 };
const LABELS = { [MODE.LOCAL]: 'Local', [MODE.NETLIFY]: 'Netlify', [MODE.CHECKING]: 'Checking...' };
const COLORS = { [MODE.LOCAL]: '#2ecc71', [MODE.NETLIFY]: '#f39c12', [MODE.CHECKING]: '#95a5a6' };
const PROXY_KEYS = { [MODE.LOCAL]: LOCAL_PROXY, [MODE.NETLIFY]: NETLIFY_PROXY };

export default function LocReport({ theme, toggleTheme }) {
  const [form, setForm] = useState(loadForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [mode, setMode] = useState(ON_LOCALHOST ? MODE.LOCAL : MODE.CHECKING);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => { saveForm(form); }, [form]);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const proxyFetch = useCallback(async (target) => {
    const proxyUrl = PROXY_KEYS[mode];
    if (!proxyUrl) throw new Error('No proxy available');
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, token: form.token }),
    });
    let result;
    try { result = await res.json(); } catch {
      throw new Error(`Proxy returned non-JSON (${res.status}).`);
    }
    if (!res.ok) throw new Error(`Proxy error: ${result.error}`);
    if (result.status >= 400) {
      if (result.status === 404) return null;
      throw new Error(`GitLab API error (${result.status}): ${JSON.stringify(result.data).slice(0, 200)}`);
    }
    return result.data;
  }, [mode, form.token]);

  useEffect(() => {
    if (ON_LOCALHOST) return;
    fetch(LOCAL_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: '/ping', token: '' }),
    })
      .then(() => { setMode(MODE.LOCAL); })
      .catch(() => { setMode(MODE.NETLIFY); });
  }, []);

  const fetchReport = async () => {
    setError('');
    setReport(null);
    if (!form.token || !form.userId || !form.startDate || !form.endDate) {
      setError('All fields are required');
      return;
    }

    setLoading(true);
    try {
      const base = form.baseUrl.replace(/\/+$/, '');
      const since = `${form.startDate}T00:00:00Z`;
      const until = `${form.endDate}T23:59:59Z`;

      setStatusMsg('Fetching project list...');
      const projects = await proxyFetch(`${base}/projects?membership=true&per_page=100&simple=true`);
      if (!projects || !projects.length) {
        throw new Error('No projects found for this token. Check membership.');
      }

      const projectRows = [];
      const commitRows = [];
      const processedProjects = [];
      const seenCommits = new Set();

      for (const proj of projects) {
        const pid = proj.id;
        const pname = proj.name || proj.path_with_namespace || `Project ${pid}`;

        let page = 1;
        let projectCommits = [];
        while (true) {
          const url = `${base}/projects/${pid}/repository/commits?since=${since}&until=${until}&author=${encodeURIComponent(form.userId)}&per_page=100&page=${page}`;
          setStatusMsg(`Fetching ${pname} (page ${page})...`);
          const commits = await proxyFetch(url);
          if (!commits || !commits.length) break;
          projectCommits = projectCommits.concat(commits);
          if (commits.length < 100) break;
          page++;
          await new Promise(r => setTimeout(r, 100));
        }

        if (!projectCommits.length) {
          setStatusMsg(`No commits found in ${pname}, skipping...`);
          await new Promise(r => setTimeout(r, 50));
          continue;
        }

        let added = 0, deleted = 0;
        for (const c of projectCommits) {
          const stats = c.stats || { additions: 0, deletions: 0 };
          const add = stats.additions || 0;
          const del = stats.deletions || 0;
          added += add;
          deleted += del;

          if (!seenCommits.has(c.id)) {
            seenCommits.add(c.id);
            commitRows.push({
              project: pname,
              sha: c.id?.substring(0, 8),
              message: (c.title || c.message || '').split('\n')[0],
              date: c.committed_date || c.created_at || '',
              added: add,
              deleted: del,
            });
          }
        }

        processedProjects.push({ project: pname, commits: projectCommits.length, added, deleted });
        projectRows.push({ project: pname, commits: projectCommits.length, added, deleted });

        setStatusMsg(`${pname}: ${projectCommits.length} commits, +${added}/-${deleted} lines`);
        await new Promise(r => setTimeout(r, 50));
      }

      if (!processedProjects.length) {
        throw new Error(`No commits found for user "${form.userId}" in the given date range.`);
      }

      const totalAdded = sumKey(projectRows, 'added');
      const totalDeleted = sumKey(projectRows, 'deleted');
      const totalCommits = commitRows.length;
      const netLoc = totalAdded - totalDeleted;

      setStatusMsg('');
      setReport({ totalCommits, totalAdded, totalDeleted, netLoc, projects: processedProjects, commits: commitRows });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const modeName = ON_LOCALHOST ? 'Localhost /proxy' : LABELS[mode];

  return (
    <div className="container">
      <div className="card" style={{ minHeight: '80vh' }}>
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: COLORS[ON_LOCALHOST ? MODE.LOCAL : mode] }} />
            {modeName}
          </span>
        </div>

        <h1>LOC REPORT</h1>
        <p className="field-label" style={{ color: 'var(--text-muted)', textTransform: 'none', fontSize: '1rem', marginBottom: '2rem' }}>
          Calculate lines of code written by a user via Git commits.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="field-label">GitLab Base URL</label>
            <input type="text" className="main-input" value={form.baseUrl} onChange={e => updateField('baseUrl', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field-label">Private Token</label>
            <input type="password" className="main-input" placeholder="glpat-..." value={form.token} onChange={e => updateField('token', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field-label">User ID / Username</label>
            <input type="text" className="main-input" placeholder="DLBPR02929" value={form.userId} onChange={e => updateField('userId', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field-label">Start Date</label>
            <input type="date" className="main-input" value={form.startDate} onChange={e => updateField('startDate', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field-label">End Date</label>
            <input type="date" className="main-input" value={form.endDate} onChange={e => updateField('endDate', e.target.value)} />
          </div>
        </div>

        {error && <div className="error-message"><span>⚠️ {error}</span></div>}

        <button className="btn-primary" onClick={fetchReport} disabled={loading} style={{ width: '100%', marginBottom: '2rem' }}>
          {loading ? (statusMsg || 'Working...') : '📊 Fetch Report'}
        </button>

        {report && (
          <div className="locr-results">
            <div className="locr-summary-grid">
              <div className="locr-card locr-card--primary">
                <div className="locr-card-value">{formatNumber(report.totalCommits)}</div>
                <div className="locr-card-label">Total Commits</div>
              </div>
              <div className="locr-card locr-card--add">
                <div className="locr-card-value">+{formatNumber(report.totalAdded)}</div>
                <div className="locr-card-label">Lines Added</div>
              </div>
              <div className="locr-card locr-card--del">
                <div className="locr-card-value">-{formatNumber(report.totalDeleted)}</div>
                <div className="locr-card-label">Lines Deleted</div>
              </div>
              <div className="locr-card locr-card--net">
                <div className="locr-card-value">{formatNumber(report.netLoc)}</div>
                <div className="locr-card-label">Net LOC</div>
              </div>
            </div>

            <div className="locr-section">
              <h3 className="locr-section-title">Project Breakdown</h3>
              <div className="locr-table-wrap">
                <table className="locr-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Commits</th>
                      <th>Added</th>
                      <th>Deleted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.projects.map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{p.project}</td>
                        <td>{p.commits}</td>
                        <td style={{ color: 'var(--success)' }}>+{formatNumber(p.added)}</td>
                        <td style={{ color: 'var(--error)' }}>-{formatNumber(p.deleted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="locr-section">
              <h3 className="locr-section-title">Recent Commits ({report.commits.length})</h3>
              <div className="locr-table-wrap" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="locr-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Project</th>
                      <th>Message</th>
                      <th>Added</th>
                      <th>Deleted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.commits.map((c, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                          {c.date ? new Date(c.date).toLocaleDateString('en-IN') : '-'}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{c.project}</td>
                        <td style={{ fontSize: '0.8rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.message}>
                          {c.message}
                        </td>
                        <td style={{ color: 'var(--success)' }}>+{formatNumber(c.added)}</td>
                        <td style={{ color: 'var(--error)' }}>-{formatNumber(c.deleted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!ON_LOCALHOST && mode !== MODE.CHECKING && (
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
            {mode === MODE.NETLIFY
              ? 'Netlify proxy cannot reach internal GitLab. Run internal-server.py locally and open http://localhost:8080'
              : 'Local proxy detected at /proxy'}
          </p>
        )}
      </div>
    </div>
  );
}
