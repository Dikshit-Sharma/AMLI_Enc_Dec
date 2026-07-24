import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { fetchBSAEntries, addBSAEntry, updateBSAEntry, deleteBSAEntry, fetchBSAHistory, bulkUpdateBSA } from './api';
import { SkeletonTableRows } from './Skeleton';

function Highlight({ text, query }) {
  if (!query || !text) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return <>{parts.map((p, i) => regex.test(p) ? <mark key={i} style={{ background: 'rgba(250,204,21,0.4)', borderRadius: '2px', padding: '0 1px' }}>{p}</mark> : p)}</>;
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

function fuzzyMatch(a, b) {
  const al = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bl = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (al === bl) return true;
  if (al.includes(bl) || bl.includes(al)) return true;
  if (Math.abs(al.length - bl.length) <= 2) {
    let diffs = 0;
    for (let i = 0; i < Math.min(al.length, bl.length); i++) {
      if (al[i] !== bl[i]) diffs++;
    }
    if (diffs <= 2) return true;
  }
  return false;
}

function formatDate(ts) {
  if (!ts) return '';
  try {
    let d;
    if (typeof ts === 'string') d = new Date(ts);
    else if (ts.seconds) d = new Date(ts.seconds * 1000);
    else if (ts._seconds) d = new Date(ts._seconds * 1000);
    else if (ts.toDate) d = ts.toDate();
    else d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch { return ''; }
}

function formatDateTime(ts) {
  if (!ts) return '';
  try {
    let d;
    if (typeof ts === 'string') d = new Date(ts);
    else if (ts.seconds) d = new Date(ts.seconds * 1000);
    else if (ts._seconds) d = new Date(ts._seconds * 1000);
    else if (ts.toDate) d = ts.toDate();
    else d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

const btnStyle = (color) => ({ background: `${color}15`, border: `1px solid ${color}40`, borderRadius: '0.5rem', padding: '0.35rem 0.75rem', cursor: 'pointer', color, fontSize: '0.75rem', fontWeight: 600 });

function AddForm({ onAdded, onCancel, existingEntries }) {
  const [api, setApi] = useState('');
  const [consumerStr, setConsumerStr] = useState('');
  const [spocStr, setSpocStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [dupes, setDupes] = useState([]);

  const checkDupes = (val) => {
    const names = val.split(';').map(s => s.trim()).filter(Boolean);
    const allConsumers = existingEntries.flatMap(e => (e.consumers || []).map(c => c.name));
    const found = [];
    names.forEach(n => {
      allConsumers.forEach(ex => { if (fuzzyMatch(n, ex) && n !== ex) found.push({ new: n, existing: ex }); });
    });
    setDupes(found);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!api.trim()) return;
    setSaving(true);
    try {
      const names = consumerStr.split(';').map(s => s.trim()).filter(Boolean);
      const spocs = spocStr.split(';').map(s => s.trim()).filter(Boolean);
      const consumers = names.map((name, i) => ({ name, spoc: spocs[i] || '' }));
      await addBSAEntry({ api: api.trim(), consumers });
      setApi(''); setConsumerStr(''); setSpocStr(''); setDupes([]);
      onAdded();
    } catch (err) { alert('Failed to add: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem', padding: '1rem', background: 'var(--output-bg)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
      <input className="main-input" placeholder="API Name *" value={api} onChange={(e) => setApi(e.target.value)} required style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }} />
      <input className="main-input" placeholder="Consumers (semicolon-separated)" value={consumerStr} onChange={(e) => { setConsumerStr(e.target.value); checkDupes(e.target.value); }} style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }} />
      <input className="main-input" placeholder="SPOCs (semicolon-separated, matching order)" value={spocStr} onChange={(e) => setSpocStr(e.target.value)} style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }} />
      {dupes.length > 0 && (
        <div style={{ gridColumn: '1 / -1', padding: '0.5rem 0.75rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '0.4rem', fontSize: '0.75rem', color: '#92400e' }}>
          ⚠ Possible duplicates: {dupes.map((d, i) => <span key={i}>"{d.new}" ≈ "{d.existing}"{i < dupes.length - 1 ? ', ' : ''}</span>)}
        </div>
      )}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.4rem' }}>
        <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }}>
          {saving ? <div className="loader tiny" /> : '+ Add Entry'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '0.45rem 1rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
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
    } catch (err) { alert('Failed to save: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <tr className="expanded-row-content">
      <td colSpan={7}>
        <div className="expanded-row-inner" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', alignItems: 'end' }}>
          <div><div className="field-label" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>API Name</div><input className="main-input" value={api} onChange={(e) => setApi(e.target.value)} style={{ fontSize: '0.85rem', padding: '0.45rem 0.65rem' }} /></div>
          <div><div className="field-label" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>Consumers</div><input className="main-input" value={consumerStr} onChange={(e) => setConsumerStr(e.target.value)} placeholder="App1; App2" style={{ fontSize: '0.85rem', padding: '0.45rem 0.65rem' }} /></div>
          <div><div className="field-label" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>SPOCs</div><input className="main-input" value={spocStr} onChange={(e) => setSpocStr(e.target.value)} placeholder="Alice; Bob" style={{ fontSize: '0.85rem', padding: '0.45rem 0.65rem' }} /></div>
          <div style={{ display: 'flex', gap: '0.4rem', gridColumn: '1 / -1' }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', width: 'auto' }}>{saving ? <div className="loader tiny" /> : 'Save'}</button>
            <button onClick={onCancel} style={{ padding: '0.4rem 1rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ExpandedRow({ consumers, conflicts, search }) {
  if (!consumers || consumers.length === 0) {
    return <tr className="expanded-row-content"><td colSpan={7}><div className="expanded-row-inner" style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.75rem' }}>No consumers added yet.</div></td></tr>;
  }
  return (
    <tr className="expanded-row-content"><td colSpan={7}>
      <div className="expanded-row-inner">
        <div className="field-label" style={{ fontSize: '0.7rem', marginBottom: '0.3rem' }}>Consumers & SPOCs</div>
        <div className="table-responsive">
          <table className="api-table" style={{ margin: 0 }}>
            <thead><tr><th>Consumer (App ID)</th><th>SPOC</th><th>Status</th></tr></thead>
            <tbody>
              {consumers.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}><Highlight text={c.name} query={search} /></td>
                  <td style={{ color: c.spoc ? 'var(--text)' : 'var(--text-muted)' }}><Highlight text={c.spoc || '—'} query={search} /></td>
                  <td>{conflicts[c.name] && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontWeight: 600 }}>⚠ {conflicts[c.name].join(', ')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </td></tr>
  );
}

function VersionHistoryModal({ entryId, entryApi, onClose }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBSAHistory(entryId).then(r => setVersions(r.versions || [])).catch(() => {}).finally(() => setLoading(false));
  }, [entryId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', padding: '1.25rem', maxHeight: '80vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>History: {entryApi}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}><div className="loader tiny" style={{ margin: '0 auto' }} /></div>
        : versions.length === 0 ? <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No history yet.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {versions.map((v, i) => (
              <div key={v.id || i} style={{ padding: '0.65rem 0.85rem', background: 'var(--input-bg)', borderRadius: '0.5rem', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{v.changeType === 'bulk-edit' ? 'Bulk Edit' : 'Edit'}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatDateTime(v.timestamp)}</span>
                </div>
                {v.detail && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{v.detail}</div>}
                {v.before && v.after && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.4rem', fontSize: '0.72rem' }}>
                    <div style={{ color: 'var(--error)', opacity: 0.8 }}>
                      {v.before.api && <div>API: {v.before.api}</div>}
                      {(v.before.consumers || []).slice(0, 5).map((c, j) => <div key={j}>{c.name} → {c.spoc || '—'}</div>)}
                      {v.before.consumers?.length > 5 && <div>+{v.before.consumers.length - 5} more</div>}
                    </div>
                    <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>→</div>
                    <div style={{ color: 'var(--success)' }}>
                      {v.after.api && v.after.api !== v.before?.api && <div>API: {v.after.api}</div>}
                      {(v.after.consumers || []).slice(0, 5).map((c, j) => {
                        const old = (v.before?.consumers || []).find(o => o.name === c.name);
                        const changed = old && (old.spoc !== c.spoc || old.name !== c.name);
                        return <div key={j} style={{ color: changed ? 'var(--primary)' : 'var(--text-muted)' }}>{c.name} → {c.spoc || '—'}{changed ? ' ✦' : ''}</div>;
                      })}
                      {v.after.consumers?.length > 5 && <div>+{v.after.consumers.length - 5} more</div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}

function BulkEditPanel({ selectedCount, onApply, onCancel }) {
  const [newSpoc, setNewSpoc] = useState('');
  const [saving, setSaving] = useState(false);

  const handleApply = async () => {
    if (!newSpoc.trim()) return;
    setSaving(true);
    try {
      await onApply(newSpoc.trim());
      setNewSpoc('');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.65rem 0.85rem', background: 'var(--output-bg)', borderRadius: '0.5rem', border: '1px solid var(--border)', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Bulk Edit ({selectedCount} selected)</span>
      <input className="main-input" placeholder="Set all SPOCs to..." value={newSpoc} onChange={(e) => setNewSpoc(e.target.value)} style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem', maxWidth: '200px' }} />
      <button onClick={handleApply} disabled={saving || !newSpoc.trim()} style={{ ...btnStyle('var(--primary)'), opacity: saving || !newSpoc.trim() ? 0.5 : 1 }}>
        {saving ? '...' : 'Apply SPOC'}
      </button>
      <button onClick={onCancel} style={{ padding: '0.35rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>Cancel</button>
    </div>
  );
}

function CSVImportPreview({ data, onConfirm, onCancel }) {
  const [saving, setSaving] = useState(false);
  const apis = Object.keys(data);
  const totalCount = Object.values(data).flat().length;
  const errors = [];

  apis.forEach(api => {
    data[api].forEach((c, i) => {
      if (!c.name) errors.push(`Row ${i + 1} in "${api}": missing consumer name`);
    });
  });

  const handleConfirm = async () => {
    setSaving(true);
    try {
      for (const api of apis) {
        await addBSAEntry({ api, consumers: data[api] });
      }
      onConfirm();
    } catch (err) { alert('Import failed: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--output-bg)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Import Preview — {apis.length} API(s), {totalCount} consumer(s)</div>
        {errors.length > 0 && <span style={{ fontSize: '0.7rem', color: '#b45309' }}>{errors.length} issue(s)</span>}
      </div>
      <div style={{ maxHeight: '200px', overflow: 'auto' }}>
        <table className="api-table" style={{ fontSize: '0.78rem' }}>
          <thead><tr><th>API</th><th>Consumer</th><th>SPOC</th></tr></thead>
          <tbody>
            {apis.map(api => data[api].map((c, i) => (
              <tr key={`${api}-${i}`}>
                <td>{i === 0 ? api : ''}</td>
                <td>{c.name}</td>
                <td style={{ color: c.spoc ? 'var(--text)' : 'var(--text-muted)' }}>{c.spoc || '—'}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '0.4rem 0.85rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
        <button className="btn-primary" onClick={handleConfirm} disabled={saving} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', width: 'auto' }}>
          {saving ? <div className="loader tiny" /> : `Confirm Import (${totalCount})`}
        </button>
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
  const [apiFilter, setApiFilter] = useState('');
  const [viewMode, setViewMode] = useState('api');
  const [historyTarget, setHistoryTarget] = useState(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [csvPreview, setCsvPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [copyMenuId, setCopyMenuId] = useState(null);
  const [copyFields, setCopyFields] = useState({ api: true, consumer: true, spoc: true, approval: true });
  const fileInputRef = useRef(null);

  const loadEntries = async () => {
    try { const data = await fetchBSAEntries(); setEntries(data.entries || []); }
    catch (err) { console.error('Failed to load BSA entries:', err); }
    finally { setLoaded(true); }
  };

  useEffect(() => { loadEntries(); }, []);

  useEffect(() => {
    if (!copyMenuId) return;
    const handler = () => setCopyMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [copyMenuId]);

  const consumerMap = useMemo(() => buildConsumerMap(entries), [entries]);
  const conflictMap = useMemo(() => buildConflictMap(entries), [entries]);

  const uniqueConsumers = useMemo(() => {
    const counts = {};
    entries.forEach(e => { (e.consumers || []).forEach(c => { counts[c.name] = (counts[c.name] || 0) + 1; }); });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const uniqueApis = useMemo(() => {
    const counts = {};
    entries.forEach(e => { counts[e.api] = (counts[e.api] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const filtered = useMemo(() => {
    let result = entries;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e => e.api.toLowerCase().includes(q) || (e.consumers || []).some(c => c.name.toLowerCase().includes(q) || c.spoc?.toLowerCase().includes(q)));
    }
    if (apiFilter) result = result.filter(e => e.api === apiFilter);
    if (consumerFilter) result = result.filter(e => (e.consumers || []).some(c => c.name === consumerFilter));
    return result;
  }, [entries, search, apiFilter, consumerFilter]);

  const consumerViewData = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      (e.consumers || []).forEach(c => {
        if (!map[c.name]) map[c.name] = { name: c.name, apis: [], spocs: new Set() };
        map[c.name].apis.push({ api: e.api, spoc: c.spoc, entryId: e.id });
        if (c.spoc) map[c.name].spocs.add(c.spoc);
      });
    });
    return Object.values(map).sort((a, b) => b.apis.length - a.apis.length);
  }, [filtered]);

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(prev => prev.length === filtered.length ? [] : filtered.map(e => e.id));

  const allFields = { api: true, consumer: true, spoc: true, approval: true };
  const handleCopy = (entry, fields) => { const f = fields || allFields; copyRich(buildCopyHtml([entry], f), buildCopyText([entry], f)); setCopiedId(entry.id); setCopyMenuId(null); setTimeout(() => setCopiedId(null), 2000); };
  const handleBulkCopy = (fields) => { const sel = filtered.filter(e => selectedIds.includes(e.id)); if (!sel.length) return; const f = fields || allFields; copyRich(buildCopyHtml(sel, f), buildCopyText(sel, f)); setBulkCopied(true); setCopyMenuId(null); setTimeout(() => setBulkCopied(false), 2000); };

  const buildCopyHtml = (list, fields) => {
    const headers = [];
    if (fields.api) headers.push('API');
    if (fields.consumer) headers.push('Consumer');
    if (fields.spoc) headers.push('SPOC');
    if (fields.approval) headers.push('Approval');
    const rows = list.flatMap(e => (e.consumers || []).map(c => {
      const cells = [];
      if (fields.api) cells.push(`<td style="border:1px solid #ccc;padding:6px 10px;">${e.api}</td>`);
      if (fields.consumer) cells.push(`<td style="border:1px solid #ccc;padding:6px 10px;">${c.name}</td>`);
      if (fields.spoc) cells.push(`<td style="border:1px solid #ccc;padding:6px 10px;">${c.spoc || ''}</td>`);
      if (fields.approval) cells.push(`<td style="border:1px solid #ccc;padding:6px 10px;background:#fee2e2;color:#dc2626;font-weight:600;">Pending</td>`);
      return `<tr>${cells.join('')}</tr>`;
    }));
    return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;"><thead><tr>${headers.map(h => `<th style="border:1px solid #ccc;padding:6px 10px;background:#f3f4f6;text-align:left;">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  };
  const buildCopyText = (list, fields) => {
    const cols = [];
    if (fields.api) cols.push('API');
    if (fields.consumer) cols.push('Consumer');
    if (fields.spoc) cols.push('SPOC');
    if (fields.approval) cols.push('Approval');
    const lines = [cols.join('\t')];
    list.forEach(e => (e.consumers || []).forEach(c => {
      const vals = [];
      if (fields.api) vals.push(e.api);
      if (fields.consumer) vals.push(c.name);
      if (fields.spoc) vals.push(c.spoc || '');
      if (fields.approval) vals.push('Pending');
      lines.push(vals.join('\t'));
    }));
    return lines.join('\n');
  };
  const copyRich = (html, text) => { if (navigator.clipboard && window.ClipboardItem) { navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]).catch(() => navigator.clipboard.writeText(text)); } else { navigator.clipboard.writeText(text); } };

  const handleExportExcel = () => {
    const rows = []; filtered.forEach(e => (e.consumers || []).forEach(c => rows.push({ API: e.api, Consumer: c.name, SPOC: c.spoc || '', Approval: 'Pending', Updated: e.updatedAt || e.createdAt || '' })));
    if (!rows.length) { alert('No data to export.'); return; }
    const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 22 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'BSA');
    XLSX.writeFile(wb, `BSA_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; setImporting(true);
    try {
      const text = await file.text(); const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { alert('CSV must have a header row and at least one data row.'); return; }
      const header = lines[0].toLowerCase();
      if (!header.includes('api') && !header.includes('consumer')) { alert('CSV should have columns: API, Consumer, SPOC (SPOC is optional).'); return; }
      const apiMap = {};
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const [api, consumer, spoc] = cols; if (!api || !consumer) continue;
        if (!apiMap[api]) apiMap[api] = []; apiMap[api].push({ name: consumer, spoc: spoc || '' });
      }
      if (!Object.keys(apiMap).length) { alert('No valid rows found.'); return; }
      setCsvPreview(apiMap);
    } catch (err) { alert('Import failed: ' + err.message); }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleBulkEditSpoc = async (newSpoc) => {
    await bulkUpdateBSA(selectedIds, { newSpoc });
    setShowBulkEdit(false); setSelectedIds([]); loadEntries();
  };

  const handleDelete = async () => { if (!deleteTarget) return; try { await deleteBSAEntry(deleteTarget.id); setDeleteTarget(null); loadEntries(); } catch (err) { alert('Failed to delete: ' + err.message); } };

  return (
    <div className="container">
      <div className="card">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0, fontSize: '0.85rem' }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme} style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}>{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setViewMode(v => v === 'api' ? 'consumer' : 'api')} style={{ ...btnStyle('var(--primary)'), padding: '0.35rem 0.65rem' }}>
              {viewMode === 'api' ? '👤 By Consumer' : '📡 By API'}
            </button>
            {selectedIds.length > 0 && (
              <>
                <div style={{ display: 'flex', position: 'relative' }}>
                  <button onClick={() => handleBulkCopy()} style={{ ...btnStyle('var(--success)'), borderRadius: '4px 0 0 4px', borderRight: 'none' }}>{bulkCopied ? '✓ Copied!' : `📋 Copy (${selectedIds.length})`}</button>
                  <button onClick={() => setCopyMenuId(copyMenuId === 'bulk' ? null : 'bulk')} style={{ ...btnStyle('var(--success)'), borderRadius: '0 4px 4px 0', padding: '0.35rem 0.5rem', fontSize: '0.7rem' }}>▾</button>
                  {copyMenuId === 'bulk' && (
                    <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', minWidth: '160px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                      {[
                        { key: 'api', label: 'API' },
                        { key: 'consumer', label: 'Consumer' },
                        { key: 'spoc', label: 'SPOC' },
                        { key: 'approval', label: 'Approval' },
                      ].map(f => (
                        <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text)' }}>
                          <input type="checkbox" checked={copyFields[f.key]} onChange={() => setCopyFields(p => ({ ...p, [f.key]: !p[f.key] }))} style={{ accentColor: 'var(--primary)' }} />
                          {f.label}
                        </label>
                      ))}
                      <button onClick={() => handleBulkCopy(copyFields)} style={{ width: '100%', marginTop: '6px', padding: '4px 8px', fontSize: '0.75rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Copy</button>
                    </div>
                  )}
                </div>
                <button onClick={() => setShowBulkEdit(p => !p)} style={{ ...btnStyle('#f59e0b') }}>✏️ Bulk Edit</button>
              </>
            )}
            <button onClick={handleExportExcel} style={btnStyle('var(--success)')}>📥 Export</button>
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} style={btnStyle('#d97706')}>{importing ? '...' : '📤 Import'}</button>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportCSV} style={{ display: 'none' }} />
            <button onClick={() => { setExpandForm(p => !p); setEditingId(null); }} style={btnStyle('var(--primary)')}>{expandForm ? '✕ Close' : '+ New'}</button>
          </div>
        </div>

        <h1 style={{ fontSize: '1.4rem', marginBottom: '0.75rem' }}>📊 BSA</h1>

        {csvPreview && <CSVImportPreview data={csvPreview} onConfirm={() => { setCsvPreview(null); loadEntries(); }} onCancel={() => setCsvPreview(null)} />}

        {showBulkEdit && selectedIds.length > 0 && <BulkEditPanel selectedCount={selectedIds.length} onApply={handleBulkEditSpoc} onCancel={() => setShowBulkEdit(false)} />}

        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <input type="text" className="main-input" placeholder="Search by API, consumer, or SPOC..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ fontSize: '0.9rem', padding: '0.65rem 0.85rem' }} />
          {search && <div style={{ marginTop: '0.3rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{filtered.length} of {entries.length} match</div>}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {uniqueApis.length > 0 && (
            <select value={apiFilter} onChange={(e) => setApiFilter(e.target.value)} style={{ padding: '0.35rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '0.78rem', cursor: 'pointer', minWidth: '140px' }}>
              <option value="">All APIs ({uniqueApis.length})</option>
              {uniqueApis.map(([name, count]) => <option key={name} value={name}>{name} ({count})</option>)}
            </select>
          )}
          {uniqueConsumers.length > 0 && (
            <select value={consumerFilter} onChange={(e) => setConsumerFilter(e.target.value)} style={{ padding: '0.35rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '0.78rem', cursor: 'pointer', minWidth: '140px' }}>
              <option value="">All Consumers ({uniqueConsumers.length})</option>
              {uniqueConsumers.map(([name, count]) => <option key={name} value={name}>{name} ({count})</option>)}
            </select>
          )}
          {(apiFilter || consumerFilter) && (
            <button onClick={() => { setApiFilter(''); setConsumerFilter(''); }} style={{ padding: '0.35rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer' }}>✕ Clear filters</button>
          )}
        </div>

        {expandForm && <AddForm onAdded={() => { loadEntries(); setExpandForm(false); }} onCancel={() => setExpandForm(false)} existingEntries={entries} />}

        <div style={{ textAlign: 'center', padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          {entries.length} total API{entries.length !== 1 && 's'} · {Object.keys(consumerMap).length} unique consumer{Object.keys(consumerMap).length !== 1 && 's'}
          {Object.keys(conflictMap).length > 0 && <span style={{ color: '#b45309', marginLeft: '0.5rem' }}> · {Object.keys(conflictMap).length} conflict{Object.keys(conflictMap).length !== 1 && 's'}</span>}
          {search && ` · matching "${search}"`}
          {apiFilter && ` · API: "${apiFilter}"`}
          {consumerFilter && ` · Consumer: "${consumerFilter}"`}
        </div>

        {!loaded ? (
          <div className="table-responsive">
            <table className="api-table">
              <thead><tr><th style={{ width: '36px' }}></th><th>Sr.</th><th>API</th><th>Consumers</th><th>Updated</th><th style={{ width: '120px' }}>Actions</th></tr></thead>
              <tbody><SkeletonTableRows rows={5} cols={6} /></tbody>
            </table>
          </div>
        ) : viewMode === 'consumer' ? (
          consumerViewData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No data to display.</div>
          ) : (
            <div className="table-responsive">
              <table className="api-table">
                <thead><tr><th>Sr.</th><th>Consumer</th><th>APIs</th><th>SPOCs</th><th>Conflicts</th></tr></thead>
                <tbody>
                  {consumerViewData.map((cv, i) => (
                    <React.Fragment key={cv.name}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === cv.name ? null : cv.name)}>
                        <td>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{expandedId === cv.name ? '▼' : '▶'} <Highlight text={cv.name} query={search} /></td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {cv.apis.map(a => a.api).join('; ')}
                          <span style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem', borderRadius: '2rem', background: 'var(--input-bg)', border: '1px solid var(--border)', marginLeft: '0.35rem', fontWeight: 600 }}>{cv.apis.length}</span>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{[...cv.spocs].join('; ') || '—'}</td>
                        <td>{conflictMap[cv.name] && <span style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem', borderRadius: '2rem', background: '#fef3c7', border: '1px solid #fde68a', color: '#b45309', fontWeight: 600 }}>⚠ conflict</span>}</td>
                      </tr>
                      {expandedId === cv.name && (
                        <tr className="expanded-row-content"><td colSpan={5}>
                          <div className="expanded-row-inner">
                            <div className="field-label" style={{ fontSize: '0.7rem', marginBottom: '0.3rem' }}>APIs for {cv.name}</div>
                            <div className="table-responsive">
                              <table className="api-table" style={{ margin: 0 }}>
                                <thead><tr><th>API</th><th>SPOC</th><th></th></tr></thead>
                                <tbody>
                                  {cv.apis.map((a, j) => (
                                    <tr key={j}>
                                      <td style={{ fontWeight: 500 }}>{a.api}</td>
                                      <td style={{ color: a.spoc ? 'var(--text)' : 'var(--text-muted)' }}>{a.spoc || '—'}</td>
                                      <td><button className="copy-icon-btn" onClick={(e) => { e.stopPropagation(); setHistoryTarget({ id: a.entryId, api: a.api }); }} title="History">🕐</button></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            {search || consumerFilter || apiFilter ? 'No matching entries found.' : 'No BSA entries yet. Click "+ New" to add one.'}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="api-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>
                    <input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
                  </th>
                  <th>Sr.</th><th>API</th><th>Consumers</th><th>Updated</th><th style={{ width: '120px' }}>Actions</th>
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
                        <td style={{ fontWeight: 600 }}>{expandedId === entry.id ? '▼' : '▶'} <Highlight text={entry.api} query={search} /></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{(entry.consumers || []).map(c => c.name).join('; ') || '—'}</span>
                            <span style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem', borderRadius: '2rem', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600 }}>{entry.consumers?.length || 0}</span>
                            {(entry.consumers || []).some(c => conflictMap[c.name]) && <span style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem', borderRadius: '2rem', background: '#fef3c7', border: '1px solid #fde68a', color: '#b45309', fontWeight: 600 }}>⚠ conflict</span>}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatDate(entry.updatedAt || entry.createdAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.3rem', position: 'relative' }}>
                            <button className="copy-icon-btn" onClick={() => setEditingId(entry.id)} title="Edit">✏️</button>
                            <div style={{ display: 'flex', position: 'relative' }}>
                              <button className={`copy-icon-btn ${copiedId === entry.id ? 'copied' : ''}`} onClick={() => handleCopy(entry)} title="Copy all">{copiedId === entry.id ? '✓' : '📋'}</button>
                              <button className="copy-icon-btn" onClick={() => setCopyMenuId(copyMenuId === entry.id ? null : entry.id)} title="Choose fields" style={{ fontSize: '0.6rem', padding: '0.2rem 0.3rem', borderLeft: 'none', borderRadius: '0 4px 4px 0' }}>▾</button>
                              {copyMenuId === entry.id && (
                                <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', minWidth: '160px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                                  {[
                                    { key: 'api', label: 'API' },
                                    { key: 'consumer', label: 'Consumer' },
                                    { key: 'spoc', label: 'SPOC' },
                                    { key: 'approval', label: 'Approval' },
                                  ].map(f => (
                                    <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text)' }}>
                                      <input type="checkbox" checked={copyFields[f.key]} onChange={() => setCopyFields(p => ({ ...p, [f.key]: !p[f.key] }))} style={{ accentColor: 'var(--primary)' }} />
                                      {f.label}
                                    </label>
                                  ))}
                                  <button onClick={() => handleCopy(entry, copyFields)} style={{ width: '100%', marginTop: '6px', padding: '4px 8px', fontSize: '0.75rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Copy</button>
                                </div>
                              )}
                            </div>
                            <button className="copy-icon-btn" onClick={() => setHistoryTarget({ id: entry.id, api: entry.api })} title="History">🕐</button>
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
      {historyTarget && <VersionHistoryModal entryId={historyTarget.id} entryApi={historyTarget.api} onClose={() => setHistoryTarget(null)} />}
    </div>
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
