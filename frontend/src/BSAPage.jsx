import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchBSAEntries, addBSAEntry, updateBSAEntry, deleteBSAEntry } from './api';
import { SkeletonTableRows } from './Skeleton';

function NewEntryForm({ onAdded }) {
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
      const consumers = names.map((name, i) => ({
        name,
        spoc: spocs[i] || '',
      }));
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
        gridTemplateColumns: '1fr 1fr 1fr auto',
        gap: '0.75rem',
        marginBottom: '1.5rem',
        padding: '1.5rem',
        background: 'var(--output-bg)',
        borderRadius: '1rem',
        border: '1px solid var(--border)',
        alignItems: 'end',
      }}
    >
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>API Name *</label>
        <input
          className="main-input"
          placeholder="e.g. PremiumQuote"
          value={api}
          onChange={(e) => setApi(e.target.value)}
          required
        />
      </div>
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Consumers (semicolon-separated)</label>
        <input
          className="main-input"
          placeholder="App1; App2; App3"
          value={consumerStr}
          onChange={(e) => setConsumerStr(e.target.value)}
        />
      </div>
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>SPOCs (semicolon-separated, matching order)</label>
        <input
          className="main-input"
          placeholder="Alice; Bob; Charlie"
          value={spocStr}
          onChange={(e) => setSpocStr(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={saving || !api.trim()}
        style={{
          padding: '0.6rem 1.2rem',
          borderRadius: '0.5rem',
          border: 'none',
          background: saving || !api.trim() ? 'var(--border)' : 'var(--accent)',
          color: saving || !api.trim() ? 'var(--text-muted)' : '#fff',
          fontWeight: 600,
          cursor: saving || !api.trim() ? 'not-allowed' : 'pointer',
          fontSize: '0.85rem',
          whiteSpace: 'nowrap',
        }}
      >
        {saving ? 'Saving...' : '+ New'}
      </button>
    </form>
  );
}

function EditRow({ entry, onSave, onCancel }) {
  const [api, setApi] = useState(entry.api);
  const [consumerStr, setConsumerStr] = useState(
    (entry.consumers || []).map(c => c.name).join('; ')
  );
  const [spocStr, setSpocStr] = useState(
    (entry.consumers || []).map(c => c.spoc).join('; ')
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!api.trim()) return;
    setSaving(true);
    try {
      const names = consumerStr.split(';').map(s => s.trim()).filter(Boolean);
      const spocs = spocStr.split(';').map(s => s.trim()).filter(Boolean);
      const consumers = names.map((name, i) => ({
        name,
        spoc: spocs[i] || '',
      }));
      await updateBSAEntry(entry.id, { api: api.trim(), consumers });
      onSave();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr style={{ background: 'var(--output-bg)' }}>
      <td style={{ padding: '0.5rem 0.75rem' }}>
        <input
          className="main-input"
          value={api}
          onChange={(e) => setApi(e.target.value)}
          style={{ width: '100%', fontSize: '0.85rem' }}
        />
      </td>
      <td style={{ padding: '0.5rem 0.75rem' }}>
        <input
          className="main-input"
          value={consumerStr}
          onChange={(e) => setConsumerStr(e.target.value)}
          placeholder="App1; App2"
          style={{ width: '100%', fontSize: '0.85rem' }}
        />
      </td>
      <td style={{ padding: '0.5rem 0.75rem', display: 'flex', gap: '0.4rem' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: '0.4rem',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {saving ? '...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: '0.4rem',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: '0.78rem',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </td>
    </tr>
  );
}

function ConfirmDeleteModal({ entry, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '400px', padding: '1.5rem' }}
      >
        <h3 style={{ margin: '0 0 0.75rem' }}>Delete BSA Entry</h3>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem', fontSize: '0.9rem' }}>
          Are you sure you want to delete <strong>{entry.api}</strong>?
          This will remove {entry.consumers?.length || 0} consumer(s).
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#ef4444',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpandedRow({ consumers }) {
  if (!consumers || consumers.length === 0) {
    return (
      <tr>
        <td colSpan={3} style={{ padding: '0.75rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
          No consumers added yet.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={3} style={{ padding: '0 0.75rem 0.75rem 0.75rem' }}>
        <div style={{
          marginLeft: '1.5rem',
          background: 'var(--input-bg)',
          borderRadius: '0.5rem',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--output-bg)' }}>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Consumer (App ID)</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>SPOC</th>
              </tr>
            </thead>
            <tbody>
              {consumers.map((c, i) => (
                <tr key={i} style={{ borderBottom: i < consumers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '0.45rem 0.75rem' }}>{c.name}</td>
                  <td style={{ padding: '0.45rem 0.75rem', color: c.spoc ? 'var(--text)' : 'var(--text-muted)' }}>
                    {c.spoc || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

  useEffect(() => {
    loadEntries();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) =>
      e.api.toLowerCase().includes(q) ||
      (e.consumers || []).some(c => c.name.toLowerCase().includes(q) || c.spoc.toLowerCase().includes(q))
    );
  }, [entries, search]);

  const handleCopy = (entry) => {
    const lines = ['Consumer\tSPOC\tApproval'];
    (entry.consumers || []).forEach((c) => {
      lines.push(`${c.name}\t${c.spoc || ''}\tPending`);
    });
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Copied to clipboard!');
    });
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

  const thStyle = {
    padding: '0.65rem 0.75rem',
    textAlign: 'left',
    fontWeight: 600,
    borderBottom: '2px solid var(--border)',
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <Link to="/" className="back-link">&larr; Home</Link>
        <h1 style={{ margin: '0.25rem 0 0' }}>BSA</h1>
        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
          Business Stakeholder Alignment — API consumers and SPOC mapping
        </p>
      </header>

      <NewEntryForm onAdded={loadEntries} />

      <div style={{ marginBottom: '1rem' }}>
        <input
          className="main-input"
          placeholder="Search by API, consumer, or SPOC..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: '400px' }}
        />
      </div>

      {!loaded ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>API</th>
              <th style={thStyle}>Consumers</th>
              <th style={{ ...thStyle, width: '140px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            <SkeletonTableRows rows={4} cols={3} />
          </tbody>
        </table>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: 'var(--text-muted)',
          background: 'var(--output-bg)',
          borderRadius: '1rem',
          border: '1px solid var(--border)',
        }}>
          <p style={{ fontSize: '1.1rem', margin: '0 0 0.5rem' }}>
            {search ? 'No matching entries found.' : 'No BSA entries yet.'}
          </p>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>
            {search ? 'Try a different search.' : 'Create your first entry above.'}
          </p>
        </div>
      ) : (
        <div style={{
          background: 'var(--output-bg)',
          borderRadius: '1rem',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>API</th>
                <th style={thStyle}>Consumers</th>
                <th style={{ ...thStyle, width: '140px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                editingId === entry.id ? (
                  <EditRow
                    key={entry.id}
                    entry={entry}
                    onSave={() => { setEditingId(null); loadEntries(); }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <React.Fragment key={entry.id}>
                    <tr
                      style={{
                        borderBottom: expandedId === entry.id ? 'none' : '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 500 }}>
                        <span style={{ marginRight: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {expandedId === entry.id ? '▼' : '▶'}
                        </span>
                        {entry.api}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        {(entry.consumers || []).map(c => c.name).join('; ') || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setEditingId(entry.id)}
                            title="Edit"
                            style={{
                              padding: '0.3rem 0.6rem',
                              borderRadius: '0.35rem',
                              border: '1px solid var(--border)',
                              background: 'var(--input-bg)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleCopy(entry)}
                            title="Copy"
                            style={{
                              padding: '0.3rem 0.6rem',
                              borderRadius: '0.35rem',
                              border: '1px solid var(--border)',
                              background: 'var(--input-bg)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                            }}
                          >
                            📋
                          </button>
                          <button
                            onClick={() => setDeleteTarget(entry)}
                            title="Delete"
                            style={{
                              padding: '0.3rem 0.6rem',
                              borderRadius: '0.35rem',
                              border: '1px solid var(--border)',
                              background: 'var(--input-bg)',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === entry.id && (
                      <ExpandedRow consumers={entry.consumers} />
                    )}
                  </React.Fragment>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          entry={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
