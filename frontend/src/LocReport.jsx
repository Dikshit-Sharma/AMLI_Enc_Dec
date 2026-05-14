import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './LocReport.css';

function formatNumber(n) {
  return n.toLocaleString('en-IN');
}

function sumKey(arr, key) {
  return arr.reduce((s, p) => s + (p[key] || 0), 0);
}

export default function LocReport({ theme, toggleTheme }) {
  const [form, setForm] = useState({
    baseUrl: 'https://repo.maxlifeinsurance.com/api/v4',
    token: '',
    userId: '',
    startDate: '',
    endDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

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
      const headers = { 'PRIVATE-TOKEN': form.token };
      const since = `${form.startDate}T00:00:00Z`;
      const until = `${form.endDate}T23:59:59Z`;

      // 1. Fetch all projects (membership)
      const projRes = await fetch(`${base}/projects?membership=true&per_page=100&simple=true`, { headers });
      if (!projRes.ok) {
        const body = await projRes.text().catch(() => '');
        throw new Error(`Failed to fetch projects (${projRes.status}): ${body.slice(0, 200)}`);
      }
      const projects = await projRes.json();
      if (!projects.length) {
        throw new Error('No projects found for this token. Check membership.');
      }

      // 2. For each project, fetch commits by author
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
          const res = await fetch(url, { headers });
          if (!res.ok) {
            if (res.status === 404) break; // repo may not exist
            const body = await res.text().catch(() => '');
            throw new Error(`Failed to fetch commits for ${pname} (${res.status}): ${body.slice(0, 200)}`);
          }
          const commits = await res.json();
          if (!commits.length) break;
          projectCommits = projectCommits.concat(commits);
          if (commits.length < 100) break;
          page++;
          await new Promise(r => setTimeout(r, 100)); // rate limit backoff
        }

        if (!projectCommits.length) continue;

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

        await new Promise(r => setTimeout(r, 100)); // rate limit backoff
      }

      if (!processedProjects.length) {
        throw new Error(`No commits found for user "${form.userId}" in the given date range.`);
      }

      const totalAdded = sumKey(projectRows, 'added');
      const totalDeleted = sumKey(projectRows, 'deleted');
      const totalCommits = commitRows.length;
      const netLoc = totalAdded - totalDeleted;
      const modified = commitRows.filter(c => c.added > 0 && c.deleted > 0).length;

      setReport({
        totalCommits,
        totalAdded,
        totalDeleted,
        netLoc,
        modified,
        projects: processedProjects,
        commits: commitRows,
      });
    } catch (err) {
      setError(err.message);
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
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
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
          {loading ? <div className="loader tiny" /> : '📊 Fetch Report'}
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
      </div>
    </div>
  );
}
