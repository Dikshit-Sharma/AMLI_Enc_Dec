import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SkeletonTableRows } from './Skeleton';

const ENVS = ['DEV', 'UAT', 'PROD'];

function SetupForm({ initial, onConnect, onCancel }) {
  const [form, setForm] = useState(initial || { jenkinsUrl: '', token: '', label: '' });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.jenkinsUrl.trim() || !form.token.trim()) return;
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
      {onCancel && (
        <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <button type="button" onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, font: 'inherit' }}>
            ← Back to saved connection
          </button>
        </div>
      )}
      <div className="form-group">
        <label className="field-label">Jenkins URL</label>
        <input className="main-input" placeholder="https://jenkins.example.com" value={form.jenkinsUrl} onChange={(e) => setForm({ ...form, jenkinsUrl: e.target.value })} required />
      </div>
      <div className="form-group">
        <label className="field-label">Label (optional)</label>
        <input className="main-input" placeholder="e.g. Corp Jenkins" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="field-label">Token</label>
        <input type="password" className="main-input" placeholder="API token or Git token" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} required autoComplete="off" />
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
    <div onClick={() => onSelect(job)} style={{
      display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
      background: selected ? 'var(--primary-glow)' : 'var(--input-bg)',
      border: selected ? '2px solid var(--primary)' : '1px solid var(--border)',
      borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.15s', marginBottom: '0.5rem',
    }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: colorDot, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.name}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          {job.repoUrl ? (job.repoUrl.split('/').pop()?.replace('.git', '') || job.repoUrl) : '—'}
          {job.branch ? ` · ${job.branch}` : ''}
          <span style={{ marginLeft: '8px' }}>· Last build: {ts}</span>
        </div>
      </div>
      {job.lastBuildNumber && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>#{job.lastBuildNumber}</div>}
    </div>
  );
}

function PipelineDetail({ job }) {
  if (!job) return null;
  return (
    <div style={{ marginTop: '1rem', padding: '1.5rem', background: 'var(--output-bg)', borderRadius: '1rem', border: '1px solid var(--border)' }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>{job.name}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div><div className="field-label">Repository</div><div style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>{job.repoUrl || 'Not detected'}</div></div>
        <div><div className="field-label">Branch</div><div style={{ fontSize: '0.9rem' }}>{job.branch || 'Not detected'}</div></div>
        <div><div className="field-label">Environment</div><div><span className="badge-env" data-env={job.env}>{job.env}</span></div></div>
        <div><div className="field-label">Last Build</div><div style={{ fontSize: '0.9rem' }}>#{job.lastBuildNumber || '—'} {job.lastBuildTimestamp ? `(${new Date(job.lastBuildTimestamp).toLocaleString('en-IN')})` : ''}</div></div>
      </div>
      {job.propertyFiles?.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div className="field-label">Configuration Files</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {job.propertyFiles.map((f, i) => (
              <span key={i} style={{ padding: '0.25rem 0.75rem', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '0.5rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>{f}</span>
            ))}
          </div>
        </div>
      )}
      {job.parameters?.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div className="field-label">Build Parameters</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {job.parameters.map((p, i) => (
              <span key={i} style={{ padding: '0.25rem 0.75rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '0.5rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>{p.name}={p.value}</span>
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
  const jobsWithRepos = jobs.filter(j => j.repoUrl);
  const groups = {};
  for (const j of jobsWithRepos) {
    const repo = j.repoUrl.split('/').pop()?.replace('.git', '') || j.repoUrl;
    if (!groups[repo]) groups[repo] = [];
    groups[repo].push(j);
  }
  const result = Object.entries(groups).map(([repo, pipelineJobs]) => ({
    repo,
    pipelines: pipelineJobs.length,
    endpoints: pipelineJobs.map(j => ({ pipeline: j.name, env: j.env, lastBuild: j.lastBuildNumber, url: j.url })),
  }));

  return (
    <div>
      <h3 style={{ marginBottom: '1rem' }}>🗺️ Pipeline → Repository Mapping</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Pipelines grouped by their Git repository. Each pipeline under the same repo may deploy different endpoints or configurations.
      </p>
      {result.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No repository information detected.</div>
      ) : (
        result.map((group, i) => (
          <div key={i} style={{ marginBottom: '1rem', padding: '1.25rem', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{group.repo}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{group.pipelines} pipeline{group.pipelines !== 1 ? 's' : ''}</div>
            </div>
            {group.endpoints.map((ep, j) => (
              <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: j % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
                <div><span style={{ fontWeight: 600 }}>{ep.pipeline}</span></div>
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

function extractEnv(name) {
  const lower = name.toLowerCase();
  if (lower.includes('prod') || lower.includes('production')) return 'PROD';
  if (lower.includes('uat') || lower.includes('staging') || lower.includes('stage')) return 'UAT';
  if (lower.includes('dev') || lower.includes('develop') || lower.includes('test') || lower.includes('qa')) return 'DEV';
  return 'OTHER';
}

function extractRepoUrl(configXml) {
  if (!configXml) return null;
  const urlMatch = configXml.match(/<url>(.*?)<\/url>/i);
  return urlMatch ? urlMatch[1].trim() : null;
}

function extractBranch(configXml) {
  if (!configXml) return null;
  const branchMatch = configXml.match(/<branches>.*?<name>\*\*(.*?)\*\*<\/name>.*?<\/branches>/is);
  if (branchMatch) return branchMatch[1].trim();
  const masterMatch = configXml.match(/<name>\*\*(master|main)\*\*<\/name>/i);
  return masterMatch ? masterMatch[1] : null;
}

function extractPropertyFiles(configXml) {
  if (!configXml) return [];
  const files = [];
  const patterns = [
    /--spring\.config\.(?:name|location)=["']?([^\s"'&]+)/gi,
    /-DpropertyFile=["']?([^\s"'&]+)/gi,
    /-Dconfig\.file=["']?([^\s"'&]+)/gi,
    /config\/([\w.-]+\.(?:properties|yml|yaml))/gi,
    /([\w.-]+\.properties)/gi,
    /([\w.-]+\.ya?ml)/gi,
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(configXml)) !== null) {
      const f = m[1].trim();
      if (!files.includes(f) && !f.includes('pom.xml') && !f.includes('package.json')) {
        files.push(f);
      }
    }
  }
  return files;
}

const PROXY_ONLY = ['save_connection', 'load_connection', 'delete_connection', 'update_connection', 'list_connections'];

async function api(action, extra = {}) {
  if (PROXY_ONLY.includes(action)) {
    const res = await fetch('/api/jenkins-proxy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  const { jenkinsUrl, token, jobName } = extra;
  if (!jenkinsUrl || !token) throw new Error('jenkinsUrl and token required');
  const base = jenkinsUrl.replace(/\/+$/, '');
  const auth = 'Basic ' + btoa(token + ':' + token);

  const directFetch = async (url) => {
    const r = await fetch(url, { headers: { 'Authorization': auth } });
    if (!r.ok) throw new Error(`Jenkins returned ${r.status}`);
    return r;
  };

  try {
    if (action === 'test_connection') {
      const r = await directFetch(`${base}/api/json?tree=nodeName`);
      const data = await r.json();
      return { connected: true, nodeName: data.nodeName || 'Jenkins' };
    }

    if (action === 'list_jobs') {
      const r = await directFetch(`${base}/api/json?tree=jobs[name,url,color,lastSuccessfulBuild[number,timestamp]]`);
      const data = await r.json();
      return {
        jobs: (data.jobs || []).map(j => ({
          name: j.name, url: j.url, color: j.color,
          env: extractEnv(j.name),
          lastBuildNumber: j.lastSuccessfulBuild?.number || null,
          lastBuildTimestamp: j.lastSuccessfulBuild?.timestamp || null,
        })),
      };
    }

    if (action === 'job_detail') {
      if (!jobName) throw new Error('jobName required');
      const enc = encodeURIComponent(jobName);
      const [jobData, configXml] = await Promise.all([
        directFetch(`${base}/job/${enc}/api/json`).then(r => r.json()),
        directFetch(`${base}/job/${enc}/config.xml`).then(r => r.ok ? r.text() : null).catch(() => null),
      ]);
      let lastBuildData = null;
      if (jobData.lastSuccessfulBuild?.number) {
        try {
          lastBuildData = await directFetch(`${base}/job/${enc}/${jobData.lastSuccessfulBuild.number}/api/json`).then(r => r.json());
        } catch {}
      }
      const parameters = lastBuildData
        ? ((lastBuildData.actions || []).find(a => a._class === 'hudson.model.ParametersAction')?.parameters || []).map(p => ({ name: p.name, value: p.value }))
        : [];
      const envFromParams = parameters.find(p => p.name?.toLowerCase() === 'env' || p.name?.toLowerCase() === 'environment');
      return {
        name: jobData.name, url: jobData.url, description: jobData.description || '',
        env: envFromParams?.value || extractEnv(jobData.name),
        repoUrl: extractRepoUrl(configXml), branch: extractBranch(configXml),
        propertyFiles: extractPropertyFiles(configXml || ''),
        parameters, lastBuild: jobData.lastSuccessfulBuild?.number || null,
        lastBuildTimestamp: jobData.lastSuccessfulBuild?.timestamp || null,
        buildable: jobData.buildable, inQueue: jobData.inQueue,
        configXml: configXml ? configXml.slice(0, 5000) : null,
      };
    }

    throw new Error('Unknown action: ' + action);
  } catch (err) {
    console.warn('Direct Jenkins call failed, falling back to proxy:', err.message);
    const res = await fetch('/api/jenkins-proxy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Proxy failed');
    return data;
  }
}

function CredentialPrompt({ connMeta, onCredentials, onCancel }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onCredentials({ token: token.trim() });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--card-bg)', borderRadius: '1rem', padding: '2rem',
        maxWidth: '400px', width: '90%', border: '1px solid var(--border)',
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Enter Token</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Token is not stored — enter it to refresh. Connected to {connMeta?.label || connMeta?.jenkinsUrl}.
        </p>
        <div className="form-group">
          <label className="field-label">Token</label>
          <input type="password" className="main-input" placeholder="API token or Git token" value={token} onChange={e => setToken(e.target.value)} required autoComplete="off" />
        </div>
        {error && <div className="error-message"><span>⚠️ {error}</span></div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 1 }}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem', border: '1px solid var(--border)', borderRadius: '0.5rem', background: 'var(--input-bg)', cursor: 'pointer', color: 'var(--text-muted)' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const JenkinsPage = ({ theme, toggleTheme }) => {
  const [connectionId, setConnectionId] = useState(null);
  const [connMeta, setConnMeta] = useState(null);
  const [allJobs, setAllJobs] = useState([]);
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeEnv, setActiveEnv] = useState('ALL');
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDetails, setJobDetails] = useState({});
  const [showSetup, setShowSetup] = useState(false);
  const [showCredPrompt, setShowCredPrompt] = useState(false);

  useEffect(() => {
    api('load_connection').then(data => {
      if (data && data.id) {
        setConnectionId(data.id);
        setConnMeta({ jenkinsUrl: data.jenkinsUrl, label: data.label });
        setAllJobs(data.jobs || []);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const fetchAndSaveJobs = async (jenkinsUrl, creds) => {
    const listData = await api('list_jobs', { jenkinsUrl, token: creds.token });
    const jobsWithDetails = await Promise.all((listData.jobs || []).map(async (job) => {
      try {
        return await api('job_detail', { jenkinsUrl, token: creds.token, jobName: job.name });
      } catch { return job; }
    }));
    const saveData = await api('save_connection', {
      jenkinsUrl, label: connMeta?.label || jenkinsUrl, jobs: jobsWithDetails,
    });
    return { id: saveData.id, jobs: jobsWithDetails };
  };

  const handleConnect = async (form) => {
    await api('test_connection', { jenkinsUrl: form.jenkinsUrl, token: form.token });
    setCredentials({ token: form.token });
    const { id, jobs } = await fetchAndSaveJobs(form.jenkinsUrl, { token: form.token });
    setConnectionId(id);
    setConnMeta({ jenkinsUrl: form.jenkinsUrl, label: form.label || form.jenkinsUrl });
    setAllJobs(jobs);
    setShowSetup(false);
  };

  const handleRefreshClick = () => {
    if (credentials) {
      doRefresh(credentials);
    } else {
      setShowCredPrompt(true);
    }
  };

  const doRefresh = async (creds) => {
    if (!connMeta) return;
    setRefreshing(true);
    setError('');
    setCredentials(creds);
    setShowCredPrompt(false);
    try {
      const { id, jobs } = await fetchAndSaveJobs(connMeta.jenkinsUrl, creds);
      setConnectionId(id);
      setAllJobs(jobs);
      setSelectedJob(null);
      setJobDetails({});
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    if (connectionId) {
      try { await api('delete_connection', { id: connectionId }); } catch {}
    }
    setConnectionId(null);
    setConnMeta(null);
    setAllJobs([]);
    setCredentials(null);
    setSelectedJob(null);
    setJobDetails({});
    setShowSetup(false);
  };

  const loadDetail = async (job) => {
    setSelectedJob(job);
    if (jobDetails[job.name]?.propertyFiles) return;
    setJobDetails(prev => ({ ...prev, [job.name]: job }));
  };

  const filteredJobs = activeEnv === 'ALL' ? allJobs : activeEnv === 'OTHER' ? allJobs.filter(j => !ENVS.includes(j.env)) : allJobs.filter(j => j.env === activeEnv);

  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          <div className="loader" style={{ margin: '0 auto 1rem' }} />
          Loading saved connection...
        </div>
      </div>
    );
  }

  if (!connectionId || showSetup) {
    return (
      <div className="container">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
        </div>
        <h1>🔧 JENKINS PIPELINES</h1>
        <SetupForm
          initial={showSetup && connMeta ? { jenkinsUrl: connMeta.jenkinsUrl, token: '', label: connMeta.label } : null}
          onConnect={handleConnect}
          onCancel={connectionId ? () => setShowSetup(false) : null}
        />
      </div>
    );
  }

  return (
    <div className="container">
      {showCredPrompt && (
        <CredentialPrompt
          connMeta={connMeta}
          onCredentials={doRefresh}
          onCancel={() => setShowCredPrompt(false)}
        />
      )}
      <div className="card">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleRefreshClick} disabled={refreshing} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--input-bg)', cursor: 'pointer', color: 'var(--text)' }}>
              {refreshing ? '🔄 Refreshing...' : credentials ? '🔄 Refresh from Jenkins' : '🔄 Connect & Refresh'}
            </button>
            <button onClick={() => setShowSetup(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--input-bg)', cursor: 'pointer', color: 'var(--text)' }}>
              Change Connection
            </button>
            <button onClick={handleDisconnect} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', color: '#ef4444' }}>
              Disconnect
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
          <h1 style={{ margin: 0 }}>🔧 JENKINS PIPELINES</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>
            <div>{connMeta?.label ? new URL(connMeta.jenkinsUrl).hostname : ''}</div>
            <div style={{ fontSize: '0.75rem' }}>{allJobs.length} pipelines · {credentials ? 'Live session' : 'Cached data'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', marginTop: '1rem', justifyContent: 'center' }}>
          {['ALL', ...ENVS, 'OTHER', 'EXTENSIONS'].map((env) => {
            const count = env === 'ALL' ? allJobs.length : env === 'EXTENSIONS' ? 0 : env === 'OTHER' ? allJobs.filter(j => !ENVS.includes(j.env)).length : allJobs.filter(j => j.env === env).length;
            return (
              <button key={env} onClick={() => { setActiveEnv(env); setSelectedJob(null); }}
                className={`toggle-btn ${activeEnv === env ? 'active' : ''}`}
                style={{ flex: 'none', padding: '0.75rem 1.5rem', fontWeight: 700, fontSize: '0.9rem', borderRadius: '0.75rem', border: activeEnv === env ? '2px solid var(--primary)' : '1px solid var(--border)', background: activeEnv === env ? 'var(--primary-glow)' : 'var(--input-bg)', color: activeEnv === env ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {env === 'ALL' ? '📋 All' : env === 'OTHER' ? '📁 Other' : env === 'EXTENSIONS' ? '🗺️ Extensions' : env}
                {env !== 'EXTENSIONS' && <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>({count})</span>}
              </button>
            );
          })}
        </div>

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}><span>⚠️ {error}</span></div>}

        {!credentials && (
          <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Showing cached pipeline data from last fetch.{' '}
            <button onClick={handleRefreshClick} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>
              Enter credentials to refresh
            </button>
          </div>
        )}

        {activeEnv === 'EXTENSIONS' ? (
          <ExtensionsTab jobs={allJobs} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selectedJob ? '1fr 1fr' : '1fr', gap: '1rem' }}>
            <div>
              {filteredJobs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No pipelines found for {activeEnv}.</div>
              ) : (
                filteredJobs.map((job) => (
                  <PipelineCard key={job.name} job={{ ...job, ...jobDetails[job.name] }} onSelect={loadDetail} selected={selectedJob?.name === job.name} />
                ))
              )}
            </div>
            {selectedJob && <div><PipelineDetail job={{ ...selectedJob, ...jobDetails[selectedJob.name] }} /></div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default JenkinsPage;
