import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { SkeletonTableRows } from './Skeleton';

const ENVS = ['DEV', 'UAT', 'PROD'];

function SetupForm({ onConnect }) {
  const [form, setForm] = useState({ jenkinsUrl: '', username: '', token: '' });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.jenkinsUrl.trim() || !form.username.trim() || !form.token.trim()) return;
    setConnecting(true);
    setError('');
    try {
      await onConnect(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: '520px', margin: '2rem auto', padding: '2rem' }}>
      <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>🔗 Connect to Jenkins</h2>
      <div className="form-group">
        <label className="field-label">Jenkins URL</label>
        <input
          className="main-input"
          placeholder="https://jenkins.example.com"
          value={form.jenkinsUrl}
          onChange={(e) => setForm({ ...form, jenkinsUrl: e.target.value })}
          required
        />
      </div>
      <div className="form-group">
        <label className="field-label">Username</label>
        <input
          className="main-input"
          placeholder="jenkins-username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          required
          autoComplete="off"
        />
      </div>
      <div className="form-group">
        <label className="field-label">API Token or Password</label>
        <input
          type="password"
          className="main-input"
          placeholder="API token (preferred) or password"
          value={form.token}
          onChange={(e) => setForm({ ...form, token: e.target.value })}
          required
          autoComplete="off"
        />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          API token is recommended over password. Generate it in Jenkins &gt; Profile &gt; Configure &gt; API Token.
        </div>
      </div>
      {error && <div className="error-message"><span>⚠️ {error}</span></div>}
      <button type="submit" className="btn-primary full-width" disabled={connecting} style={{ marginTop: '1rem' }}>
        {connecting ? 'Connecting...' : 'Connect'}
      </button>
    </form>
  );
}

function PipelineCard({ job, onSelect, selected }) {
  const ts = job.lastBuildTimestamp
    ? new Date(job.lastBuildTimestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never built';

  const colorDot = job.color === 'blue' ? '#22c55e' : job.color === 'red' ? '#ef4444' : job.color === 'yellow' ? '#f59e0b' : '#888';

  return (
    <div
      onClick={() => onSelect(job)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem 1.25rem',
        background: selected ? 'var(--primary-glow)' : 'var(--input-bg)',
        border: selected ? '2px solid var(--primary)' : '1px solid var(--border)',
        borderRadius: '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.15s',
        marginBottom: '0.5rem',
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: colorDot, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.name}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          {job.repoUrl ? (
            <span title={job.repoUrl}>{job.repoUrl.split('/').pop()?.replace('.git', '') || job.repoUrl}</span>
          ) : '—'}
          {job.branch ? ` · ${job.branch}` : ''}
          <span style={{ marginLeft: '8px' }}>· Last build: {ts}</span>
        </div>
      </div>
      {job.lastBuildNumber && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>#{job.lastBuildNumber}</div>
      )}
    </div>
  );
}

function PipelineDetail({ job }) {
  if (!job) return null;
  return (
    <div style={{
      marginTop: '1rem',
      padding: '1.5rem',
      background: 'var(--output-bg)',
      borderRadius: '1rem',
      border: '1px solid var(--border)',
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>{job.name}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <div className="field-label">Repository</div>
          <div style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>{job.repoUrl || 'Not detected'}</div>
        </div>
        <div>
          <div className="field-label">Branch</div>
          <div style={{ fontSize: '0.9rem' }}>{job.branch || 'Not detected'}</div>
        </div>
        <div>
          <div className="field-label">Environment</div>
          <div><span className="badge-env" data-env={job.env}>{job.env}</span></div>
        </div>
        <div>
          <div className="field-label">Last Build</div>
          <div style={{ fontSize: '0.9rem' }}>#{job.lastBuildNumber || '—'} {job.lastBuildTimestamp ? `(${new Date(job.lastBuildTimestamp).toLocaleString('en-IN')})` : ''}</div>
        </div>
      </div>
      {job.propertyFiles?.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div className="field-label">Configuration Files</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {job.propertyFiles.map((f, i) => (
              <span key={i} style={{
                padding: '0.25rem 0.75rem',
                background: 'rgba(99,102,241,0.1)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: '0.5rem',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
              }}>{f}</span>
            ))}
          </div>
        </div>
      )}
      {job.parameters?.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div className="field-label">Build Parameters</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {job.parameters.map((p, i) => (
              <span key={i} style={{
                padding: '0.25rem 0.75rem',
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: '0.5rem',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
              }}>{p.name}={p.value}</span>
            ))}
          </div>
        </div>
      )}
      {job.description && (
        <div style={{ marginTop: '1rem' }}>
          <div className="field-label">Description</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{job.description}</div>
        </div>
      )}
    </div>
  );
}

function ExtensionsTab({ jobs }) {
  const [endpointMap, setEndpointMap] = useState({});
  const [loading, setLoading] = useState(false);

  const jobsWithRepos = jobs.filter(j => j.repoUrl);

  const groups = {};
  for (const j of jobsWithRepos) {
    const repo = j.repoUrl.split('/').pop()?.replace('.git', '') || j.repoUrl;
    if (!groups[repo]) groups[repo] = [];
    groups[repo].push(j);
  }

  const result = [];
  for (const [repo, pipelineJobs] of Object.entries(groups)) {
    const endpoints = pipelineJobs.map(j => ({
      pipeline: j.name,
      env: j.env,
      lastBuild: j.lastBuildNumber,
      url: j.url,
    }));
    result.push({ repo, pipelines: pipelineJobs.length, endpoints });
  }

  return (
    <div>
      <h3 style={{ marginBottom: '1rem' }}>🗺️ Pipeline → Repository Mapping</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Shows all Jenkins pipelines grouped by their Git repository. Each pipeline under the same repo may deploy different endpoints or configurations.
      </p>
      {result.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          No repository information detected. Pipelines need git configuration in Jenkins for this view.
        </div>
      ) : (
        result.map((group, i) => (
          <div key={i} style={{
            marginBottom: '1rem',
            padding: '1.25rem',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{group.repo}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{group.pipelines} pipeline{group.pipelines !== 1 ? 's' : ''}</div>
            </div>
            {group.endpoints.map((ep, j) => (
              <div key={j} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                background: j % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
              }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{ep.pipeline}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span className="badge-env" data-env={ep.env} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>{ep.env}</span>
                  {ep.lastBuild && <span style={{ color: 'var(--text-muted)' }}>#{ep.lastBuild}</span>}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

const JenkinsPage = ({ theme, toggleTheme }) => {
  const [connection, setConnection] = useState(() => {
    try {
      const saved = localStorage.getItem('jenkins_connection');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeEnv, setActiveEnv] = useState('ALL');
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDetails, setJobDetails] = useState({});

  const fetchJobs = async (conn) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/jenkins-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...conn, action: 'list_jobs' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch jobs');

      const jobsWithDetails = await Promise.all((data.jobs || []).map(async (job) => {
        try {
          const dRes = await fetch('/api/jenkins-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...conn, action: 'job_detail', jobName: job.name }),
          });
          const detail = await dRes.json();
          return { ...job, ...detail };
        } catch {
          return job;
        }
      }));
      setAllJobs(jobsWithDetails);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (form) => {
    const conn = { jenkinsUrl: form.jenkinsUrl, username: form.username, token: form.token };
    const res = await fetch('/api/jenkins-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...conn, action: 'test_connection' }),
    });
    const data = await res.json();
    if (!res.ok || !data.connected) throw new Error(data.error || 'Connection failed');
    localStorage.setItem('jenkins_connection', JSON.stringify(conn));
    setConnection(conn);
    await fetchJobs(conn);
  };

  const handleDisconnect = () => {
    localStorage.removeItem('jenkins_connection');
    setConnection(null);
    setAllJobs([]);
    setSelectedJob(null);
    setJobDetails({});
  };

  const loadDetail = async (job) => {
    setSelectedJob(job);
    if (jobDetails[job.name]) return;
    try {
      const res = await fetch('/api/jenkins-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...connection, action: 'job_detail', jobName: job.name }),
      });
      const detail = await res.json();
      setJobDetails(prev => ({ ...prev, [job.name]: detail }));
    } catch {}
  };

  const filteredJobs = activeEnv === 'ALL'
    ? allJobs
    : allJobs.filter(j => j.env === activeEnv);

  if (!connection) {
    return (
      <div className="container">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
        </div>
        <h1>🔧 JENKINS PIPELINES</h1>
        <SetupForm onConnect={handleConnect} />
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
          <button
            onClick={handleDisconnect}
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '0.75rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              color: '#ef4444',
              fontSize: '0.8rem',
              fontWeight: 600,
              width: 'auto',
              flex: 'none',
            }}
          >
            Disconnect
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
          <h1 style={{ margin: 0 }}>🔧 JENKINS PIPELINES</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {new URL(connection.jenkinsUrl).hostname} · {allJobs.length} pipelines
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', marginTop: '1rem', justifyContent: 'center' }}>
          {['ALL', ...ENVS, 'OTHER', 'EXTENSIONS'].map((env) => {
            const count = env === 'ALL' ? allJobs.length : env === 'EXTENSIONS' ? 0 : env === 'OTHER' ? allJobs.filter(j => !ENVS.includes(j.env)).length : allJobs.filter(j => j.env === env).length;
            return (
              <button
                key={env}
                onClick={() => { setActiveEnv(env); setSelectedJob(null); }}
                className={`toggle-btn ${activeEnv === env ? 'active' : ''}`}
                style={{
                  flex: 'none',
                  padding: '0.75rem 1.5rem',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  borderRadius: '0.75rem',
                  border: activeEnv === env ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: activeEnv === env ? 'var(--primary-glow)' : 'var(--input-bg)',
                  color: activeEnv === env ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {env === 'ALL' ? '📋 All' : env === 'OTHER' ? '📁 Other' : env === 'EXTENSIONS' ? '🗺️ Extensions' : env}
                {env !== 'EXTENSIONS' && <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>({count})</span>}
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={() => fetchJobs(connection)}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              background: 'var(--input-bg)',
              cursor: 'pointer',
              color: 'var(--text)',
            }}
          >
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}><span>⚠️ {error}</span></div>}

        {activeEnv === 'EXTENSIONS' ? (
          <ExtensionsTab jobs={allJobs} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selectedJob ? '1fr 1fr' : '1fr', gap: '1rem' }}>
            <div>
              {loading ? (
                <div className="table-responsive"><table className="api-table"><thead><tr><th>Pipeline</th><th>Repo</th><th>Branch</th><th>Last Build</th></tr></thead><tbody><SkeletonTableRows rows={6} cols={4} /></tbody></table></div>
              ) : filteredJobs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No pipelines found for {activeEnv}.
                </div>
              ) : (
                filteredJobs.map((job) => (
                  <PipelineCard
                    key={job.name}
                    job={{ ...job, ...jobDetails[job.name] }}
                    onSelect={loadDetail}
                    selected={selectedJob?.name === job.name}
                  />
                ))
              )}
            </div>
            {selectedJob && (
              <div>
                <PipelineDetail job={{ ...selectedJob, ...jobDetails[selectedJob.name] }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default JenkinsPage;
