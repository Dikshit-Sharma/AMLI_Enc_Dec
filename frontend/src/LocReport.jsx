import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './LocReport.css';

const STORAGE_KEY = 'locr_form';
const SERVER_URL = 'http://localhost:8081/loc-report';

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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch { /* ignore */ void 0; }
}

function fmt(n) {
  return (n || 0).toLocaleString('en-IN');
}

export default function LocReport({ theme, toggleTheme }) {
  const [form, setForm] = useState(loadForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => { saveForm(form); }, [form]);

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const fetchReport = async () => {
    setError('');
    setResult(null);
    if (!form.token || !form.userId || !form.startDate || !form.endDate) {
      setError('All fields are required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }
      setResult(data);
    } catch (err) {
      setError(err.message.includes('Failed to fetch')
        ? 'Cannot connect to LOC Report server. Run: python loc_report_server.py'
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ minHeight: '80vh' }}>
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
        </div>

        <h1>LOC REPORT</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginBottom: '2rem' }}>
          Calculate lines of code via GitLab merge requests.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="field-label">GitLab Base URL</label>
            <input type="text" className="main-input" value={form.baseUrl} onChange={e => update('baseUrl', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field-label">Private Token</label>
            <input type="password" className="main-input" placeholder="glpat-..." value={form.token} onChange={e => update('token', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field-label">User ID / Username</label>
            <input type="text" className="main-input" placeholder="DLBPR02929" value={form.userId} onChange={e => update('userId', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field-label">Start Date</label>
            <input type="date" className="main-input" value={form.startDate} onChange={e => update('startDate', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field-label">End Date</label>
            <input type="date" className="main-input" value={form.endDate} onChange={e => update('endDate', e.target.value)} />
          </div>
        </div>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          Make sure <code>loc_report_server.py</code> is running on <code>localhost:8081</code>.
        </p>

        {error && <div className="error-message"><span>⚠️ {error}</span></div>}

        <button className="btn-primary" onClick={fetchReport} disabled={loading} style={{ width: '100%', marginBottom: '2rem' }}>
          {loading ? 'Running report...' : '📊 Fetch Report'}
        </button>

        {result && (
          <div className="locr-results">
            <div className="locr-summary-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <div className="locr-card locr-card--primary">
                <div className="locr-card-value">{fmt(result.totals.total_added)}</div>
                <div className="locr-card-label">Lines Added</div>
              </div>
              <div className="locr-card locr-card--del">
                <div className="locr-card-value">{fmt(result.totals.total_deleted)}</div>
                <div className="locr-card-label">Lines Deleted</div>
              </div>
              <div className="locr-card" style={{ borderTopColor: '#3498db' }}>
                <div className="locr-card-value">{fmt(result.totals.total_modified)}</div>
                <div className="locr-card-label">Lines Modified</div>
              </div>
              <div className="locr-card locr-card--net">
                <div className="locr-card-value">{fmt(result.totals.total_net)}</div>
                <div className="locr-card-label">Net LOC</div>
              </div>
              <div className="locr-card locr-card--primary">
                <div className="locr-card-value">{result.mr_rows.length}</div>
                <div className="locr-card-label">Merge Requests</div>
              </div>
            </div>

            {result.mr_rows.length > 0 && (
              <div className="locr-section">
                <h3 className="locr-section-title">Merge Requests ({result.mr_rows.length})</h3>
                <div className="locr-table-wrap" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  <table className="locr-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>MR</th>
                        <th>Title</th>
                        <th>Merged</th>
                        <th>Added</th>
                        <th>Deleted</th>
                        <th>Modified</th>
                        <th>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.mr_rows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: '0.78rem' }}>{r.project_name}</td>
                          <td>!{r.mr_iid}</td>
                          <td style={{ fontSize: '0.78rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.mr_title}>{r.mr_title}</td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.merged_at ? new Date(r.merged_at).toLocaleDateString('en-IN') : '-'}</td>
                          <td style={{ color: 'var(--success)' }}>+{fmt(r.added)}</td>
                          <td style={{ color: 'var(--error)' }}>-{fmt(r.deleted)}</td>
                          <td style={{ color: '#3498db' }}>~{fmt(r.modified)}</td>
                          <td style={{ fontWeight: 600 }}>{fmt(r.net_loc)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.file_rows.length > 0 && result.file_rows.length <= 500 && (
              <div className="locr-section">
                <h3 className="locr-section-title">File-wise LOC ({result.file_rows.length})</h3>
                <div className="locr-table-wrap" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <table className="locr-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>MR</th>
                        <th>File</th>
                        <th>Added</th>
                        <th>Deleted</th>
                        <th>Modified</th>
                        <th>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.file_rows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: '0.75rem' }}>{r.project_name}</td>
                          <td>!{r.mr_iid}</td>
                          <td style={{ fontSize: '0.75rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.file}>{r.file}</td>
                          <td style={{ color: 'var(--success)' }}>+{fmt(r.added)}</td>
                          <td style={{ color: 'var(--error)' }}>-{fmt(r.deleted)}</td>
                          <td style={{ color: '#3498db' }}>~{fmt(r.modified)}</td>
                          <td style={{ fontWeight: 600 }}>{fmt(r.net_loc)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.file_rows.length > 500 && (
              <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                {result.file_rows.length} file changes found. Export via CSV/Excel for full details.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
