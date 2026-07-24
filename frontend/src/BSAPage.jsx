import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { fetchBSAEntries, addBSAEntry, updateBSAEntry, deleteBSAEntry } from './api';
import { SkeletonTableRows } from './Skeleton';

function Highlight({ text, query }) {
  if (!query || !text) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return <>{parts.map((p, i) => regex.test(p) ? <mark key={i} style={{ background: 'rgba(250,204,21,0.4)', borderRadius: '2px', padding: '0 1px' }}>{p}</mark> : p)}</>;
}

function parseConsumers(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return raw.split(';').map(s => s.trim()).filter(Boolean).map(name => ({ name, spoc: '' }));
  return [];
}

function buildConsumerMap(entries) {
  const map = {};
  entries.forEach(e => {
    (e.consumers || []).forEach(c => {
      if (!map[c.name]) map[c.name] = new Set();
      if (c.spoc) map[c.name].add(c.spoc);
    });
  });
  return map;
}

function buildConflictMap(entries) {
  const conflicts = {};
  const consumerSpocs = {};
  entries.forEach(e => {
    (e.consumers || []).forEach(c => {
      if (!c.spoc) return;
      if (!consumerSpocs[c.name]) consumerSpocs[c.name] = new Set();
      consumerSpocs[c.name].add(c.spoc);
    });
  });
  Object.entries(consumerSpocs).forEach(([name, spocs]) => {
    if (spocs.size > 1) conflicts[name] = [...spocs];
  });
  return conflicts;
}

function AddForm({ onAdded, onCancel }) {
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
      setApi(''); setConsumerStr(''); setSpocStr('');
      onAdded();
    } catch (err) {
      alert('Failed to add: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem', padding: '1rem', background: 'var(--output-bg)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
      <input className="main-input" placeholder="API Name *" value={api} onChange={(e) => setApi(e.target.value)} required style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }} />
      <input className="main-input" placeholder="Consumers (semicolon-separated)" value={consumerStr} onChange={(e) => setConsumerStr(e.target.value)} style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }} />
      <input className="main-input" placeholder="SPOCs (semicolon-separated, matching order)" value={spocStr} onChange={(e) => setSpocStr(e.target.value)} style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }} />
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.4rem' }}>
        <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }}>
          {saving ? <div className="loader tiny" /> : '+ Add Entry'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '0.45rem 1rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>
          Cancel
        </button>
      </div>
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
      <td colSpan={7}>
        <div className="expanded-row-inner" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', alignItems: 'end' }}>
          <div><div className="field-label" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>API Name</div><input className="main-input" value={api} onChange={(e) => setApi(e.target.value)} style={{ fontSize: '0.85rem', padding: '0.45rem 0.65rem' }} /></div>
          <div><div className="field-label" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>Consumers</div><input className="main-input" value={consumerStr} onChange={(e) => setConsumerStr(e.target.value)} placeholder="App1; App2" style={{ fontSize: '0.85rem', padding: '0.45rem 0.65rem' }} /></div>
          <div><div className="field-label" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>SPOCs</div><input className="main-input" value={spocStr} onChange={(e) => setSpocStr(e.target.value)} placeholder="Alice; Bob" style={{ fontSize: '0.85rem', padding: '0.45rem 0.65rem' }} /></div>
          <div style={{ display: 'flex', gap: '0.4rem', gridColumn: '1 / -1' }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', width: 'auto' }}>
              {saving ? <div className="loader tiny" /> : 'Save'}
            </button>
            <button onClick={onCancel} style={{ padding: '0.4rem 1rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ExpandedRow({ consumers, conflicts, search }) {
  if (!consumers || consumers.length === 0) {
    return (
      <tr className="expanded-row-content">
        <td colSpan={7}>
          <div className="expanded-row-inner" style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.75rem' }}>No consumers added yet.</div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="expanded-row-content">
      <td colSpan={7}>
        <div className="expanded-row-inner">
          <div className="field-label" style={{ fontSize: '0.7rem', marginBottom: '0.3rem' }}>Consumers & SPOCs</div>
          <div className="table-responsive">
            <table className="api-table" style={{ margin: 0 }}>
              <thead>
                <tr><th>Consumer (App ID)</th><th>SPOC</th><th>Status</th></tr>
              </thead>
              <tbody>
                {consumers.map((c, i) => {
                  const isConflict = conflicts[c.name];
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}><Highlight text={c.name} query={search} /></td>
                      <td style={{ color: c.spoc ? 'var(--text)' : 'var(--text-muted)' }}>
                        <Highlight text={c.spoc || '—'} query={search} />
                      </td>
                      <td>
                        {isConflict && (
                          <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontWeight: 600 }}>
                            ⚠ {isConflict.join(', ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ConfirmDeleteModal({ entry, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '360px', padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Delete BSA Entry</h3>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.82rem' }}>
          Are you sure you want to delete <strong>{entry.api}</strong>? This will remove {entry.consumers?.length || 0} consumer(s).
        </p>
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '0.4rem 0.85rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '0.4rem 0.85rem', borderRadius: '0.4rem', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function TopStakeholders({ consumerMap }) {
  const sorted = useMemo(() =>
    Object.entries(consumerMap)
      .map(([name, spocs]) => ({ name, count: spocs.size, spocs: [...spocs] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    [consumerMap]
  );

  if (sorted.length === 0) return null;

  return (
    <div style={{ background: 'var(--output-bg)', borderRadius: '0.75rem', border: '1px solid var(--border)', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
      <div className="field-label" style={{ marginBottom: '0.5rem', fontSize: '0.7rem' }}>Top Stakeholders</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        {sorted.map(s => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.5rem', borderRadius: '2rem', background: 'var(--primary-glow)', border: '1px solid rgba(99,102,241,0.25)', fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 500 }}>
            {s.name}
            <span style={{ fontSize: '0.6rem', background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: '1rem', height: '1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {s.count}
            </span>
          </span>
        ))}
      </div>
    </div>
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
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkCopied, setBulkCopied] = useState(false);
  const [consumerFilter, setConsumerFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

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

  const consumerMap = useMemo(() => buildConsumerMap(entries), [entries]);
  const conflictMap = useMemo(() => buildConflictMap(entries), [entries]);

  const uniqueConsumers = useMemo(() => {
    const counts = {};
    entries.forEach(e => {
      (e.consumers || []).forEach(c => {
        counts[c.name] = (counts[c.name] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const filtered = useMemo(() => {
    let result = entries;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.api.toLowerCase().includes(q) ||
        (e.consumers || []).some(c => c.name.toLowerCase().includes(q) || c.spoc?.toLowerCase().includes(q))
      );
    }
    if (consumerFilter) {
      result = result.filter(e => (e.consumers || []).some(c => c.name === consumerFilter));
    }
    return result;
  }, [entries, search, consumerFilter]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(e => e.id));
    }
  };

  const handleCopy = (entry) => {
    const html = buildCopyHtml([entry]);
    const text = buildCopyText([entry]);
    copyRich(html, text);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleBulkCopy = () => {
    const selected = filtered.filter(e => selectedIds.includes(e.id));
    if (selected.length === 0) return;
    const html = buildCopyHtml(selected);
    const text = buildCopyText(selected);
    copyRich(html, text);
    setBulkCopied(true);
    setTimeout(() => setBulkCopied(false), 2000);
  };

  const buildCopyHtml = (entryList) => {
    const rows = entryList.flatMap(e =>
      (e.consumers || []).map(c =>
        `<tr><td style="border:1px solid #ccc;padding:6px 10px;">${e.api}</td><td style="border:1px solid #ccc;padding:6px 10px;">${c.name}</td><td style="border:1px solid #ccc;padding:6px 10px;">${c.spoc || ''}</td><td style="border:1px solid #ccc;padding:6px 10px;background:#fee2e2;color:#dc2626;font-weight:600;">Pending</td></tr>`
      )
    );
    return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;"><thead><tr><th style="border:1px solid #ccc;padding:6px 10px;background:#f3f4f6;text-align:left;">API</th><th style="border:1px solid #ccc;padding:6px 10px;background:#f3f4f6;text-align:left;">Consumer</th><th style="border:1px solid #ccc;padding:6px 10px;background:#f3f4f6;text-align:left;">SPOC</th><th style="border:1px solid #ccc;padding:6px 10px;background:#f3f4f6;text-align:left;">Approval</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  };

  const buildCopyText = (entryList) => {
    const lines = ['API\tConsumer\tSPOC\tApproval'];
    entryList.forEach(e => {
      (e.consumers || []).forEach(c => {
        lines.push(`${e.api}\t${c.name}\t${c.spoc || ''}\tPending`);
      });
    });
    return lines.join('\n');
  };

  const copyRich = (html, text) => {
    if (navigator.clipboard && window.ClipboardItem) {
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([text], { type: 'text/plain' });
      navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]).catch(() => {
        navigator.clipboard.writeText(text);
      });
    } else {
      navigator.clipboard.writeText(text);
    }
  };

  const handleExportExcel = () => {
    const rows = [];
    filtered.forEach(e => {
      (e.consumers || []).forEach(c => {
        rows.push({ API: e.api, Consumer: c.name, SPOC: c.spoc || '', Approval: 'Pending', Updated: e.updatedAt || e.createdAt || '' });
      });
    });
    if (rows.length === 0) { alert('No data to export.'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BSA');
    XLSX.writeFile(wb, `BSA_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { alert('CSV must have a header row and at least one data row.'); return; }
      const header = lines[0].toLowerCase();
      if (!header.includes('api') && !header.includes('consumer')) {
        alert('CSV should have columns: API, Consumer, SPOC (SPOC is optional).');
        return;
      }
      const apiMap = {};
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const [api, consumer, spoc] = cols;
        if (!api || !consumer) continue;
        if (!apiMap[api]) apiMap[api] = [];
        apiMap[api].push({ name: consumer, spoc: spoc || '' });
      }
      const apis = Object.keys(apiMap);
      if (apis.length === 0) { alert('No valid rows found.'); return; }
      const confirmed = window.confirm(`Import ${apis.length} API(s) with ${Object.values(apiMap).flat().length} total consumer(s)?`);
      if (!confirmed) return;
      for (const api of apis) {
        await addBSAEntry({ api, consumers: apiMap[api] });
      }
      alert(`Imported ${apis.length} API(s) successfully.`);
      loadEntries();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  const formatDate = (ts) => {
    if (!ts) return '';
    try {
      const d = typeof ts === 'string' ? new Date(ts) : ts?.toDate?.() || new Date(ts);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch { return ''; }
  };

  return (
    <div className="container">
      <div className="card">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0, fontSize: '0.85rem' }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme} style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}>{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {selectedIds.length > 0 && (
              <button onClick={handleBulkCopy} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.5rem', padding: '0.35rem 0.75rem', cursor: 'pointer', color: 'var(--success)', fontSize: '0.75rem', fontWeight: 600 }}>
                {bulkCopied ? '✓ Copied!' : `📋 Copy (${selectedIds.length})`}
              </button>
            )}
            <button onClick={handleExportExcel} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.5rem', padding: '0.35rem 0.75rem', cursor: 'pointer', color: 'var(--success)', fontSize: '0.75rem', fontWeight: 600 }}>
              📥 Export
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '0.5rem', padding: '0.35rem 0.75rem', cursor: 'pointer', color: '#d97706', fontSize: '0.75rem', fontWeight: 600 }}>
              {importing ? '...' : '📤 Import'}
            </button>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportCSV} style={{ display: 'none' }} />
            <button onClick={() => { setExpandForm(p => !p); setEditingId(null); }} style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '0.5rem', padding: '0.35rem 0.75rem', cursor: 'pointer', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 600 }}>
              {expandForm ? '✕ Close' : '+ New'}
            </button>
          </div>
        </div>

        <h1 style={{ fontSize: '1.4rem', marginBottom: '0.75rem' }}>📊 BSA</h1>

        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <input type="text" className="main-input" placeholder="Search by API, consumer, or SPOC..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ fontSize: '0.9rem', padding: '0.65rem 0.85rem' }} />
          {search && <div style={{ marginTop: '0.3rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{filtered.length} of {entries.length} match</div>}
        </div>

        {uniqueConsumers.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 600 }}>
              Filter by consumer {consumerFilter && <span style={{ textTransform: 'none', marginLeft: '0.4rem' }}>(<button onClick={() => setConsumerFilter('')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.65rem', textDecoration: 'underline' }}>clear</button>)</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {uniqueConsumers.slice(0, 20).map(([name, count]) => (
                <button key={name} onClick={() => setConsumerFilter(consumerFilter === name ? '' : name)} style={{ padding: '0.15rem 0.5rem', borderRadius: '2rem', border: consumerFilter === name ? '1.5px solid var(--primary)' : '1px solid var(--border)', background: consumerFilter === name ? 'var(--primary-glow)' : 'var(--input-bg)', color: consumerFilter === name ? 'var(--primary)' : 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: consumerFilter === name ? 600 : 400, transition: 'all 0.15s' }}>
                  {name} <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>({count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {expandForm && <AddForm onAdded={() => { loadEntries(); setExpandForm(false); }} onCancel={() => setExpandForm(false)} />}

        <TopStakeholders consumerMap={consumerMap} />

        <div style={{ textAlign: 'center', padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          {entries.length} total API{entries.length !== 1 && 's'} · {Object.keys(consumerMap).length} unique consumer{Object.keys(consumerMap).length !== 1 && 's'}
          {Object.keys(conflictMap).length > 0 && <span style={{ color: '#b45309', marginLeft: '0.5rem' }}> · {Object.keys(conflictMap).length} conflict{Object.keys(conflictMap).length !== 1 && 's'}</span>}
          {search && ` · matching "${search}"`}
          {consumerFilter && ` · filtered by "${consumerFilter}"`}
        </div>

        {!loaded ? (
          <div className="table-responsive">
            <table className="api-table">
              <thead><tr><th style={{ width: '36px' }}></th><th>Sr.</th><th>API</th><th>Consumers</th><th>Updated</th><th style={{ width: '120px' }}>Actions</th></tr></thead>
              <tbody><SkeletonTableRows rows={5} cols={6} /></tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            {search || consumerFilter ? 'No matching entries found.' : 'No BSA entries yet. Click "+ New" to add one.'}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="api-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>
                    <input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
                  </th>
                  <th>Sr.</th>
                  <th>API</th>
                  <th>Consumers</th>
                  <th>Updated</th>
                  <th style={{ width: '120px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, index) => (
                  editingId === entry.id ? (
                    <EditInline key={entry.id} entry={entry} onSave={() => { setEditingId(null); loadEntries(); }} onCancel={() => setEditingId(null)} />
                  ) : (
                    <React.Fragment key={entry.id}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={() => toggleSelect(entry.id)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
                        </td>
                        <td>{index + 1}</td>
                        <td style={{ fontWeight: 600 }}>
                          {expandedId === entry.id ? '▼' : '▶'} <Highlight text={entry.api} query={search} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                              {(entry.consumers || []).map(c => c.name).join('; ') || '—'}
                            </span>
                            <span style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem', borderRadius: '2rem', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {entry.consumers?.length || 0}
                            </span>
                            {(entry.consumers || []).some(c => conflictMap[c.name]) && (
                              <span style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem', borderRadius: '2rem', background: '#fef3c7', border: '1px solid #fde68a', color: '#b45309', fontWeight: 600 }}>⚠ conflict</span>
                            )}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatDate(entry.updatedAt || entry.createdAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.3rem' }}>
                            <button className="copy-icon-btn" onClick={() => setEditingId(entry.id)} title="Edit">✏️</button>
                            <button className={`copy-icon-btn ${copiedId === entry.id ? 'copied' : ''}`} onClick={() => handleCopy(entry)} title="Copy">{copiedId === entry.id ? '✓' : '📋'}</button>
                            <button className="copy-icon-btn" onClick={() => setDeleteTarget(entry)} title="Delete" style={{ color: 'var(--error)', borderColor: 'rgba(244,63,94,0.3)' }}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === entry.id && <ExpandedRow consumers={entry.consumers} conflicts={conflictMap} search={search} />}
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
