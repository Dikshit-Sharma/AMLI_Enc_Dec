import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchBSAEntries, addBSAEntry, updateBSAEntry, deleteBSAEntry } from './api';
import { SkeletonTableRows } from './Skeleton';

function AddForm({ onAdded }) {
  const [api, setApi] = useState('');
  const [consumerStr, setConsumerStr] = useState('');
  const [spocStr, setSpocStr] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!api.trim()) return;
    setSaving(true);
    try {
      const names = consumerStr.split(';').map(s => s.trim()).filter(Boolean);
      const spocs = spocStr.split(';').map(s => s.trim()).filter(Boolean);
      const consumers = names.map((name, i) => ({ name, spoc: spocs[i] || '' }));
      await addBSAEntry({ api: api.trim(), consumers });
      setApi('');
      setConsumerStr('');
      setSpocStr('');
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
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '0.75rem',
        marginBottom: '1.5rem',
        padding: '1.5rem',
        background: 'var(--output-bg)',
        borderRadius: '1rem',
        border: '1px solid var(--border)',
      }}
    >
      <input className="main-input" placeholder="API Name *" value={api} onChange={(e) => setApi(e.target.value)} required />
      <input className="main-input" placeholder="Consumers (semicolon-separated)" value={consumerStr} onChange={(e) => setConsumerStr(e.target.value)} />
      <input className="main-input" placeholder="SPOCs (semicolon-separated, matching order)" value={spocStr} onChange={(e) => setSpocStr(e.target.value)} />
      <button type="submit" className="btn-primary" disabled={saving} style={{ gridColumn: '1 / -1', width: '100%' }}>
        {saving ? <div className="loader tiny" /> : '+ Add Entry'}
      </button>
    </form>
  );
}

function EditInline({ entry, onSave, onCancel }) {
  const [api, setApi] = useState(entry.api);
  const [consumerStr, setConsumerStr] = useState((entry.consumers || []).map(c => c.name).join('; '));
  const [spocStr, setSpocStr] = useState((entry.consumers || []).map(c => c.spoc).join('; '));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!api.trim()) return;
    setSaving(true);
    try {
      const names = consumerStr.split(';').map(s => s.trim()).filter(Boolean);
      const spocs = spocStr.split(';').map(s => s.trim()).filter(Boolean);
      const consumers = names.map((name, i) => ({ name, spoc: spocs[i] || '' }));
      await updateBSAEntry(entry.id, { api: api.trim(), consumers });
      onSave();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="expanded-row-content">
      <td colSpan={4}>
        <div className="expanded-row-inner" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', alignItems: 'end' }}>
          <div>
            <div className="field-label">API Name</div>
            <input className="main-input" value={api} onChange={(e) => setApi(e.target.value)} style={{ fontSize: '0.9rem' }} />
          </div>
          <div>
            <div className="field-label">Consumers</div>
            <input className="main-input" value={consumerStr} onChange={(e) => setConsumerStr(e.target.value)} placeholder="App1; App2" style={{ fontSize: '0.9rem' }} />
          </div>
          <div>
            <div className="field-label">SPOCs</div>
            <input className="main-input" value={spocStr} onChange={(e) => setSpocStr(e.target.value)} placeholder="Alice; Bob" style={{ fontSize: '0.9rem' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', gridColumn: '1 / -1' }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem', width: 'auto' }}>
              {saving ? <div className="loader tiny" /> : 'Save'}
            </button>
            <button onClick={onCancel} style={{ padding: '0.5rem 1.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ConfirmDeleteModal({ entry, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.75rem' }}>Delete BSA Entry</h3>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem', fontSize: '0.9rem' }}>
          Are you sure you want to delete <strong>{entry.api}</strong>?
          This will remove {entry.consumers?.length || 0} consumer(s).
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function ExpandedRow({ consumers }) {
  if (!consumers || consumers.length === 0) {
    return (
      <tr className="expanded-row-content">
        <td colSpan={4}>
          <div className="expanded-row-inner" style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: '1.5rem' }}>
            No consumers added yet.
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="expanded-row-content">
      <td colSpan={4}>
        <div className="expanded-row-inner">
          <div className="field-label">Consumers & SPOCs</div>
          <div className="table-responsive">
            <table className="api-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Consumer (App ID)</th>
                  <th>SPOC</th>
                </tr>
              </thead>
              <tbody>
                {consumers.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td style={{ color: c.spoc ? 'var(--text)' : 'var(--text-muted)' }}>{c.spoc || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function BSAPage({ theme, toggleTheme }) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expandForm, setExpandForm] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const loadEntries = async () => {
    try {
      const data = await fetchBSAEntries();
      setEntries(data.entries || []);
    } catch (err) {
      console.error('Failed to load BSA entries:', err);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { loadEntries(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) =>
      e.api.toLowerCase().includes(q) ||
      (e.consumers || []).some(c => c.name.toLowerCase().includes(q) || c.spoc?.toLowerCase().includes(q))
    );
  }, [entries, search]);

  const handleCopy = (entry) => {
    const rows = (entry.consumers || []).map(c => `<tr><td style="border:1px solid #ccc;padding:6px 10px;">${c.name}</td><td style="border:1px solid #ccc;padding:6px 10px;">${c.spoc || ''}</td><td style="border:1px solid #ccc;padding:6px 10px;background:#fee2e2;color:#dc2626;font-weight:600;">Pending</td></tr>`);
    const html = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;"><thead><tr><th style="border:1px solid #ccc;padding:6px 10px;background:#f3f4f6;text-align:left;">Consumer</th><th style="border:1px solid #ccc;padding:6px 10px;background:#f3f4f6;text-align:left;">SPOC</th><th style="border:1px solid #ccc;padding:6px 10px;background:#f3f4f6;text-align:left;">Approval</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    const text = `Consumer\tSPOC\tApproval\n${(entry.consumers || []).map(c => `${c.name}\t${c.spoc || ''}\tPending`).join('\n')}`;

    if (navigator.clipboard && window.ClipboardItem) {
      const blob = new Blob([html], { type: 'text/html' });
      const blobText = new Blob([text], { type: 'text/plain' });
      navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': blobText })]).then(() => {
        setCopiedId(entry.id);
        setTimeout(() => setCopiedId(null), 2000);
      });
    } else {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(entry.id);
        setTimeout(() => setCopiedId(null), 2000);
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBSAEntry(deleteTarget.id);
      setDeleteTarget(null);
      loadEntries();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
          <button
            onClick={() => { setExpandForm(p => !p); setEditingId(null); }}
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

        <h1>📊 BSA</h1>

        <div className="form-group" style={{ margin: '2rem 0' }}>
          <input
            type="text"
            className="main-input"
            placeholder="Search by API, consumer, or SPOC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: '1.1rem', padding: '1.25rem' }}
          />
          {search && (
            <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {filtered.length} of {entries.length} match
            </div>
          )}
        </div>

        {expandForm && <AddForm onAdded={() => { loadEntries(); setExpandForm(false); }} />}

        <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {entries.length} total entr{entries.length === 1 ? 'y' : 'ies'}
          {search && ` matching "${search}"`}
        </div>

        {!loaded ? (
          <div className="table-responsive">
            <table className="api-table">
              <thead><tr><th style={{ width: '40px' }}></th><th>Sr.</th><th>API</th><th>Consumers</th><th style={{ width: '120px' }}>Actions</th></tr></thead>
              <tbody><SkeletonTableRows rows={5} cols={5} /></tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            {search ? 'No matching entries found.' : 'No BSA entries yet. Click "+ New" to add one.'}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="api-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Sr.</th>
                  <th>API</th>
                  <th>Consumers</th>
                  <th style={{ width: '120px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, index) => (
                  editingId === entry.id ? (
                    <EditInline key={entry.id} entry={entry} onSave={() => { setEditingId(null); loadEntries(); }} onCancel={() => setEditingId(null)} />
                  ) : (
                    <React.Fragment key={entry.id}>
                      <tr
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      >
                        <td></td>
                        <td>{index + 1}</td>
                        <td style={{ fontWeight: 600 }}>
                          {expandedId === entry.id ? '▼' : '▶'} {entry.api}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                          {(entry.consumers || []).map(c => c.name).join('; ') || '—'}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="copy-icon-btn" onClick={() => setEditingId(entry.id)} title="Edit">✏️</button>
                            <button className={`copy-icon-btn ${copiedId === entry.id ? 'copied' : ''}`} onClick={() => handleCopy(entry)} title="Copy">{copiedId === entry.id ? '✓' : '📋'}</button>
                            <button className="copy-icon-btn" onClick={() => setDeleteTarget(entry)} title="Delete" style={{ color: 'var(--error)', borderColor: 'rgba(244,63,94,0.3)' }}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === entry.id && <ExpandedRow consumers={entry.consumers} />}
                    </React.Fragment>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && <ConfirmDeleteModal entry={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />}
    </div>
  );
}
