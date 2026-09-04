import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { exportToObsidian } from './obsidianExport';
import { logAnalyticsEvent } from './firebase';

export default function ExportPage({ theme, toggleTheme }) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setDone(false);
    setError('');
    setStatus('Starting export...');

    try {
      await exportToObsidian({
        onProgress: (msg) => setStatus(msg),
      });
      setDone(true);
      logAnalyticsEvent('obsidian_export', { status: 'success' });
    } catch (e) {
      console.error('Obsidian export failed:', e);
      setError(e.message || 'Export failed. Please try again.');
      logAnalyticsEvent('obsidian_export', { status: 'error', error: e.message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '700px', margin: '2rem auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <Link to="/" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textDecoration: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)' }}>&larr; Home</Link>
              <h1 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.6rem' }}>&#x1f4d6;</span> Export to Obsidian
              </h1>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
              Export all AMLI data as an Obsidian-compatible vault with Markdown notes, frontmatter, and wikilinks.
            </p>
          </div>
          <button className="theme-toggle" onClick={toggleTheme} style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', flexShrink: 0 }}>{theme === 'light' ? '\u{1F319}' : '\u{2600}\u{FE0F}'}</button>
        </div>

        {/* Vault Structure Preview */}
        <div style={{ padding: '1rem', background: 'var(--output-bg)', borderRadius: '0.75rem', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.6rem' }}>Vault Structure</div>
          <pre style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
{`AMLI_Vault/
  Dashboard.md              # Overview with wikilinks
  Artifacts/
    _Index.md               # Summary table
    SOA-1234_CreateOrder_DEV.md  # One per artifact
  BSA/
    _Index.md               # Summary table
    CreateOrder.md          # One per API
  Credentials/
    _Index.md               # All values masked
    SOA-1234_AppKey_DEV.md  # One per credential
  Clipboard/
    _Index.md               # Summary table
    Meeting Notes.md        # One per clipboard
  Changelog/
    Changelog.md            # Export timestamp`}
          </pre>
        </div>

        {/* Features */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { icon: '\u{1F517}', title: 'Wikilinks', desc: 'Cross-reference between notes' },
            { icon: '\u{1F3F7}\u{FE0F}', title: 'Tags', desc: 'Filter by content type & env' },
            { icon: '\u{1F4C4}', title: 'Frontmatter', desc: 'YAML metadata on every note' },
            { icon: '\u{1F512}', title: 'Masked Secrets', desc: 'Credentials safely masked' },
          ].map((f) => (
            <div key={f.title} style={{ padding: '0.75rem', background: 'var(--input-bg)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.2rem' }}>{f.icon} {f.title}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-primary"
          style={{
            width: '100%',
            padding: '0.85rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            opacity: exporting ? 0.7 : 1,
            transition: 'opacity 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {exporting ? (
            <>
              <div className="loader tiny" /> Exporting...
            </>
          ) : done ? (
            '\u{2705} Download Again'
          ) : (
            '\u{1F4E5} Export All to Obsidian'
          )}
        </button>

        {/* Status */}
        {status && (
          <div style={{
            marginTop: '1rem',
            padding: '0.65rem 0.85rem',
            background: done ? '#d1fae5' : error ? '#fef2f2' : 'var(--output-bg)',
            border: `1px solid ${done ? '#a7f3d0' : error ? '#fecaca' : 'var(--border)'}`,
            borderRadius: '0.5rem',
            fontSize: '0.8rem',
            color: done ? '#065f46' : error ? '#dc2626' : 'var(--text-muted)',
            transition: 'all 0.3s',
          }}>
            {status}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            marginTop: '0.5rem',
            padding: '0.65rem 0.85rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            fontSize: '0.8rem',
            color: '#dc2626',
          }}>
            {error}
          </div>
        )}

        {/* Instructions */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--output-bg)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>How to use</div>
          <ol style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: 0, paddingLeft: '1.2rem' }}>
            <li>Click <strong>Export All to Obsidian</strong> above</li>
            <li>Unzip the downloaded file</li>
            <li>Open the <code>AMLI_Vault</code> folder as a vault in Obsidian</li>
            <li>All notes are ready with wikilinks, tags, and YAML frontmatter</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
