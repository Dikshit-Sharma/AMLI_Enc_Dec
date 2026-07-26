import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle, FontSize } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import LinkExt from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Table as TableExt } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import { common, createLowlight } from 'lowlight';
import { logAnalyticsEvent } from './firebase';

const lowlight = createLowlight(common);

function genId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

const btnActive = (active) => ({
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text)',
  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
  borderRadius: '4px',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontWeight: active ? 700 : 500,
  minWidth: '28px',
  textAlign: 'center',
  transition: 'all 0.15s',
});

const ToolbarBtn = ({ active, onClick, children, title }) => (
  <button onClick={onClick} title={title} style={btnActive(active)}>{children}</button>
);

const Separator = () => <div style={{ width: '1px', background: 'var(--border)', margin: '0 2px', alignSelf: 'stretch' }} />;

function EditorToolbar({ editor, title }) {
  if (!editor) return null;

  const addTable = () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  const setLink = () => {
    const url = window.prompt('URL:');
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '6px 8px', borderBottom: '1px solid var(--border)', background: 'var(--input-bg)', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
      <select onChange={(e) => { e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run(); }} style={{ padding: '3px 4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '0.72rem', cursor: 'pointer' }}>
        <option value="">Font</option>
        <option value="Arial">Arial</option>
        <option value="Georgia">Georgia</option>
        <option value="Courier New">Courier</option>
        <option value="Verdana">Verdana</option>
        <option value="Times New Roman">Times</option>
      </select>
      <select onChange={(e) => { const s = parseInt(e.target.value); if (s) editor.chain().focus().setFontSize(s + 'px').run(); else editor.chain().focus().unsetFontSize().run(); }} style={{ padding: '3px 4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '0.72rem', cursor: 'pointer', width: '52px' }}>
        <option value="">Size</option>
        {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <Separator />
      <select onChange={(e) => { if (e.target.value === 'p') editor.chain().focus().setParagraph().run(); else editor.chain().focus().toggleHeading({ level: parseInt(e.target.value) }).run(); }} style={{ padding: '3px 4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '0.72rem', cursor: 'pointer' }}>
        <option value="p">¶ Text</option>
        {[1, 2, 3, 4, 5, 6].map(h => <option key={h} value={h}>H{h}</option>)}
      </select>
      <Separator />
      <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)"><b>B</b></ToolbarBtn>
      <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)"><i>I</i></ToolbarBtn>
      <ToolbarBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)"><u>U</u></ToolbarBtn>
      <ToolbarBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><s>S</s></ToolbarBtn>
      <ToolbarBtn active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} title="Subscript">X₂</ToolbarBtn>
      <ToolbarBtn active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Superscript">X²</ToolbarBtn>
      <ToolbarBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">{'<>'}</ToolbarBtn>
      <Separator />
      <input type="color" onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} title="Text color" style={{ width: '24px', height: '24px', padding: 0, border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }} />
      <ToolbarBtn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight">🖍</ToolbarBtn>
      <Separator />
      <ToolbarBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align left">≡</ToolbarBtn>
      <ToolbarBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align center">☰</ToolbarBtn>
      <ToolbarBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align right">≡</ToolbarBtn>
      <Separator />
      <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">• ≡</ToolbarBtn>
      <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">1. ≡</ToolbarBtn>
      <ToolbarBtn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task list">☑</ToolbarBtn>
      <Separator />
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">❝</ToolbarBtn>
      <ToolbarBtn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">{ }</ToolbarBtn>
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">—</ToolbarBtn>
      <Separator />
      <ToolbarBtn active={false} onClick={setLink} title="Insert link">🔗</ToolbarBtn>
      <ToolbarBtn active={false} onClick={addTable} title="Insert table">▦</ToolbarBtn>
      <Separator />
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)">↶</ToolbarBtn>
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Shift+Z)">↷</ToolbarBtn>
      <Separator />
      <ExportDropdown editor={editor} title={title} />
    </div>
  );
}

function ToolbarTableActions({ editor }) {
  if (!editor?.isActive('table')) return null;
  return (
    <div style={{ display: 'flex', gap: '2px', padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--input-bg)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginRight: '4px' }}>Table:</span>
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add column">+Col</ToolbarBtn>
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().addRowAfter().run()} title="Add row">+Row</ToolbarBtn>
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete column">-Col</ToolbarBtn>
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().deleteRow().run()} title="Delete row">-Row</ToolbarBtn>
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().deleteTable().run()} title="Delete table">✕ Table</ToolbarBtn>
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().mergeCells().run()} title="Merge cells">Merge</ToolbarBtn>
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().splitCell().run()} title="Split cell">Split</ToolbarBtn>
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().toggleHeaderRow().run()} title="Toggle header">Header</ToolbarBtn>
    </div>
  );
}

function htmlToMarkdown(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  function walk(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(walk).join('');
    switch (tag) {
      case 'h1': return `# ${children}\n\n`;
      case 'h2': return `## ${children}\n\n`;
      case 'h3': return `### ${children}\n\n`;
      case 'h4': return `#### ${children}\n\n`;
      case 'h5': return `##### ${children}\n\n`;
      case 'h6': return `###### ${children}\n\n`;
      case 'p': return `${children}\n\n`;
      case 'br': return '\n';
      case 'strong': case 'b': return `**${children}**`;
      case 'em': case 'i': return `*${children}*`;
      case 'u': return `<u>${children}</u>`;
      case 's': case 'del': return `~~${children}~~`;
      case 'code': return node.parentElement?.tagName === 'PRE' ? children : `\`${children}\``;
      case 'pre': return `\`\`\`\n${children}\n\`\`\`\n\n`;
      case 'blockquote': return `> ${children}\n\n`;
      case 'a': return `[${children}](${node.getAttribute('href') || ''})`;
      case 'img': return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
      case 'hr': return '---\n\n';
      case 'ul': return children;
      case 'ol': return children;
      case 'li': {
        const parent = node.parentElement?.tagName.toLowerCase();
        if (parent === 'ol') {
          const idx = Array.from(node.parentElement.children).indexOf(node) + 1;
          return `${idx}. ${children.trim()}\n`;
        }
        return `- ${children.trim()}\n`;
      }
      case 'table': {
        const rows = Array.from(node.querySelectorAll('tr'));
        if (!rows.length) return children;
        const lines = rows.map((row, ri) => {
          const cells = Array.from(row.querySelectorAll('th, td')).map(c => c.textContent.trim());
          const line = `| ${cells.join(' | ')} |`;
          if (ri === 0) return `${line}\n| ${cells.map(() => '---').join(' | ')} |`;
          return line;
        });
        return lines.join('\n') + '\n\n';
      }
      default: return children;
    }
  }
  return walk(tmp).replace(/\n{3,}/g, '\n\n').trim();
}

function ExportDropdown({ editor, title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!editor) return null;

  const exportHTML = () => {
    try {
      const html = editor.getHTML();
      const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title || 'Clipboard'}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1f2937}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d1d5db;padding:8px 12px;text-align:left}th{background:#f3f4f6}pre{background:#1e293b;color:#e2e8f0;padding:1rem;border-radius:6px;overflow-x:auto}code{background:#f3f4f6;padding:2px 4px;border-radius:3px;font-size:0.9em}blockquote{border-left:3px solid #6366f1;padding-left:1rem;color:#6b7280;font-style:italic}</style></head><body>${html}</body></html>`;
      const blob = new Blob([full], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'clipboard'}.html`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      logAnalyticsEvent('clipboard_export', { format: 'html', clipboard_title: title });
    } catch (e) { console.error('Export HTML failed:', e); }
    setOpen(false);
  };

  const exportMarkdown = () => {
    try {
      const html = editor.getHTML();
      const md = htmlToMarkdown(html);
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'clipboard'}.md`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      logAnalyticsEvent('clipboard_export', { format: 'markdown', clipboard_title: title });
    } catch (e) { console.error('Export Markdown failed:', e); }
    setOpen(false);
  };

  const exportPrint = () => {
    try {
      const html = editor.getHTML();
      const win = window.open('', '_blank');
      if (!win) { alert('Pop-up blocked. Please allow pop-ups for this site.'); setOpen(false); return; }
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title || 'Clipboard'}</title><style>@media print{body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:1rem;line-height:1.6;color:#000}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f5f5f5}pre{background:#f5f5f5;padding:0.75rem;border-radius:4px;overflow-x:auto;font-size:0.85rem}blockquote{border-left:3px solid #6366f1;padding-left:1rem;color:#555;font-style:italic}}</style></head><body>${html}</body></html>`);
      win.document.close();
      win.print();
      logAnalyticsEvent('clipboard_export', { format: 'print', clipboard_title: title });
    } catch (e) { console.error('Print failed:', e); }
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} title="Export" style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}>⬇ Export ▾</button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: '150px', overflow: 'hidden' }}>
          <button onClick={exportHTML} style={{ display: 'block', width: '100%', padding: '0.45rem 0.75rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text)', borderBottom: '1px solid var(--border)' }} onMouseEnter={(e) => e.target.style.background = 'var(--input-bg)'} onMouseLeave={(e) => e.target.style.background = 'none'}>📄 Export as HTML</button>
          <button onClick={exportMarkdown} style={{ display: 'block', width: '100%', padding: '0.45rem 0.75rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text)', borderBottom: '1px solid var(--border)' }} onMouseEnter={(e) => e.target.style.background = 'var(--input-bg)'} onMouseLeave={(e) => e.target.style.background = 'none'}>📝 Export as Markdown</button>
          <button onClick={exportPrint} style={{ display: 'block', width: '100%', padding: '0.45rem 0.75rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text)' }} onMouseEnter={(e) => e.target.style.background = 'var(--input-bg)'} onMouseLeave={(e) => e.target.style.background = 'none'}>🖨️ Print / Save PDF</button>
        </div>
      )}
    </div>
  );
}

function EditorPage({ clipboardId, theme, toggleTheme }) {
  const [title, setTitle] = useState('');
  const [syncStatus, setSyncStatus] = useState('connecting');
  const [notFound, setNotFound] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [wordCount, setWordCount] = useState({ words: 0, chars: 0, lines: 1, paragraphs: 0 });
  const [deleting, setDeleting] = useState(false);
  const saveTimeoutRef = useRef(null);
  const isRemoteUpdate = useRef(false);
  const lastVersionRef = useRef(0);
  const pollRef = useRef(null);

  const apiUpdate = useCallback(async (patch) => {
    try {
      lastVersionRef.current += 1;
      const res = await fetch('/api/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: clipboardId, ...patch }),
      });
      if (!res.ok) throw new Error('Update failed');
      setSyncStatus('synced');
      setLastSynced(new Date());
    } catch (err) {
      lastVersionRef.current = Math.max(0, lastVersionRef.current - 1);
      console.error('Save failed:', err);
      setSyncStatus('error');
    }
  }, [clipboardId]);

  const updateWordCount = useCallback((ed) => {
    try {
      const text = ed.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const lines = text.split('\n').length;
      const paragraphs = ed.getJSON().content?.filter(n => n.type === 'paragraph' && n.content?.length > 0).length || 0;
      setWordCount({ words, chars, lines, paragraphs });
    } catch (e) { /* editor not ready */ }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, strike: false, link: false, underline: false }),
      Underline,
      Strike,
      Subscript,
      Superscript,
      Highlight,
      TextStyle,
      FontSize,
      Color,
      FontFamily,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Typography,
      LinkExt.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start typing or paste content...' }),
      TableExt.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (isRemoteUpdate.current) return;
      try {
        const html = editor.getHTML();
        updateWordCount(editor);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setSyncStatus('saving');
        saveTimeoutRef.current = setTimeout(() => apiUpdate({ content: html }), 800);
      } catch (e) { /* editor not fully initialized */ }
    },
  });

  useEffect(() => {
    if (!clipboardId || !editor) return;
    let alive = true;

    const fetchDoc = async () => {
      try {
        const res = await fetch(`/api/clipboard?id=${clipboardId}`);
        if (res.status === 404) {
          if (alive) { setNotFound(true); setSyncStatus('error'); clearInterval(pollRef.current); }
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setNotFound(false);
        if (data.title !== undefined) setTitle(data.title);
        if (data.content !== undefined && data.version > lastVersionRef.current) {
          isRemoteUpdate.current = true;
          editor.commands.setContent(data.content);
          isRemoteUpdate.current = false;
          updateWordCount(editor);
        }
        if (data.version !== undefined) lastVersionRef.current = Math.max(lastVersionRef.current, data.version);
        setSyncStatus('synced');
        setLastSynced(new Date());
      } catch (err) {
        console.error('Poll error:', err);
        setSyncStatus('error');
      }
    };

    fetchDoc();
    pollRef.current = setInterval(fetchDoc, 3000);
    return () => { alive = false; clearInterval(pollRef.current); };
  }, [clipboardId, editor, updateWordCount]);

  const updateTitle = useCallback((newTitle) => {
    setTitle(newTitle);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => apiUpdate({ title: newTitle }), 500);
  }, [apiUpdate]);

  const copyId = () => {
    navigator.clipboard.writeText(clipboardId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteClipboard = async () => {
    if (!window.confirm('Delete this clipboard permanently?')) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/clipboard', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clipboardId }),
      });
      if (!res.ok) throw new Error('Delete failed');
      logAnalyticsEvent('clipboard_delete', { clipboard_id: clipboardId, clipboard_title: title });
      const saved = JSON.parse(localStorage.getItem('clipboard_recent') || '[]');
      localStorage.setItem('clipboard_recent', JSON.stringify(saved.filter(s => s.id !== clipboardId)));
      navigate('/clipboard');
    } catch (err) {
      alert('Failed to delete clipboard.');
    } finally { setDeleting(false); }
  };

  const statusColor = syncStatus === 'synced' ? 'var(--success, #22c55e)' : syncStatus === 'saving' ? '#f59e0b' : syncStatus === 'error' ? '#ef4444' : '#94a3b8';
  const statusText = syncStatus === 'synced' ? 'Synced' : syncStatus === 'saving' ? 'Saving...' : syncStatus === 'error' ? 'Error' : 'Connecting...';

  if (notFound) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: '500px', margin: '4rem auto', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
          <h2 style={{ fontSize: '1.3rem', marginBottom: '0.5rem', color: 'var(--text)' }}>Clipboard Not Found</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
            No clipboard found with ID <strong style={{ fontFamily: 'monospace' }}>{clipboardId}</strong>
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.5rem' }}>
            It may have been deleted or the ID is incorrect.
          </p>
          <Link to="/clipboard" style={{ display: 'inline-block', padding: '0.6rem 1.5rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '0.5rem', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>
            ← Back to Clipboard Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Top header bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 1rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Link to="/clipboard" className="back-link" style={{ marginBottom: 0, fontSize: '0.85rem' }}>← Back</Link>
            <input value={title} onChange={(e) => updateTitle(e.target.value)} placeholder="Untitled" style={{ background: 'transparent', border: 'none', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', outline: 'none', minWidth: '100px', maxWidth: '300px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
              {statusText}
            </span>
            {lastSynced && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{lastSynced.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
            <button onClick={copyId} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'monospace' }}>{copied ? '✓' : clipboardId}</button>
            <button onClick={() => setShowToolbar(v => !v)} title="Toggle toolbar" style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.75rem' }}>{showToolbar ? '▾' : '▸'} T</button>
            <button onClick={deleteClipboard} disabled={deleting} title="Delete clipboard" style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, opacity: deleting ? 0.5 : 1, transition: 'all 0.15s' }} onMouseEnter={(e) => { e.target.style.background = '#ef4444'; e.target.style.color = '#fff'; }} onMouseLeave={(e) => { e.target.style.background = '#fef2f2'; e.target.style.color = '#dc2626'; }}>🗑 Delete</button>
            <button className="theme-toggle" onClick={toggleTheme} style={{ padding: '0.25rem 0.45rem', fontSize: '0.82rem' }}>{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
        </div>
        {showToolbar && <EditorToolbar editor={editor} title={title} />}
        {showToolbar && <ToolbarTableActions editor={editor} />}
        <div style={{ minHeight: '65vh', padding: '1rem 1.25rem' }}>
          <EditorContent editor={editor} />
        </div>
        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 1rem', borderTop: '1px solid var(--border)', background: 'var(--input-bg)', fontSize: '0.68rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.4rem' }}>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <span>{wordCount.words.toLocaleString()} {wordCount.words === 1 ? 'word' : 'words'}</span>
            <span>{wordCount.chars.toLocaleString()} chars</span>
            <span>{wordCount.paragraphs} {wordCount.paragraphs === 1 ? 'paragraph' : 'paragraphs'}</span>
            <span>{wordCount.lines} {wordCount.lines === 1 ? 'line' : 'lines'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomePage({ theme, toggleTheme }) {
  const [clipboardId, setClipboardId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('clipboard_recent') || '[]');
    setRecent(saved);
  }, []);

  const createClipboard = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', title: 'Untitled Clipboard' }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const data = await res.json();
      const cid = data.id || genId();
      saveRecent(cid, 'Untitled Clipboard');
      logAnalyticsEvent('clipboard_create', { clipboard_id: cid });
      navigate(`/clipboard/${cid}`);
    } catch (err) {
      setError('Failed to create clipboard. Try again.');
    } finally { setCreating(false); }
  };

  const openClipboard = (e) => {
    e.preventDefault();
    const id = clipboardId.trim();
    if (!id) return;
    logAnalyticsEvent('clipboard_open', { clipboard_id: id, source: 'manual_input' });
    navigate(`/clipboard/${id}`);
  };

  const saveRecent = (id, title) => {
    const saved = JSON.parse(localStorage.getItem('clipboard_recent') || '[]');
    const updated = [{ id, title, opened: Date.now() }, ...saved.filter(s => s.id !== id)].slice(0, 10);
    localStorage.setItem('clipboard_recent', JSON.stringify(updated));
    setRecent(updated);
  };

  const removeRecent = (id) => {
    const saved = JSON.parse(localStorage.getItem('clipboard_recent') || '[]');
    const updated = saved.filter(s => s.id !== id);
    localStorage.setItem('clipboard_recent', JSON.stringify(updated));
    setRecent(updated);
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '600px', margin: '2rem auto' }}>
        {/* Header with theme toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.6rem' }}>📋</span> Clipboard
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
              Real-time collaborative rich text editor. Create a new clipboard or open an existing one.
            </p>
          </div>
          <button className="theme-toggle" onClick={toggleTheme} style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', flexShrink: 0 }}>{theme === 'light' ? '🌙' : '☀️'}</button>
        </div>

        {/* Create button */}
        <button onClick={createClipboard} disabled={creating} style={{ width: '100%', padding: '0.8rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem', opacity: creating ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          {creating ? 'Creating...' : '+ Create New Clipboard'}
        </button>

        {/* Open existing */}
        <form onSubmit={openClipboard} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <input className="main-input" placeholder="Paste a Clipboard ID..." value={clipboardId} onChange={(e) => { setClipboardId(e.target.value); setError(''); }} style={{ flex: 1, fontSize: '0.85rem', padding: '0.6rem 0.85rem' }} />
          <button type="submit" style={{ padding: '0.6rem 1.2rem', background: 'var(--success, #22c55e)', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'opacity 0.2s' }}>Open</button>
        </form>

        {error && <div style={{ padding: '0.5rem 0.85rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.4rem', color: '#dc2626', fontSize: '0.8rem', marginBottom: '1rem' }}>{error}</div>}

        {/* Recent */}
        {recent.length > 0 && (
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem' }}>🕐</span> Recent Clipboards
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {recent.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.75rem', background: 'var(--input-bg)', borderRadius: '0.4rem', border: '1px solid var(--border)', transition: 'border-color 0.15s', cursor: 'pointer' }} onClick={() => { logAnalyticsEvent('clipboard_open', { clipboard_id: r.id, source: 'recent_list' }); navigate(`/clipboard/${r.id}`); }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text)', marginBottom: '2px' }}>{r.title || 'Untitled'}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.id}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeRecent(r.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.25rem 0.4rem', borderRadius: '4px', transition: 'color 0.15s' }} title="Remove" onMouseEnter={(e) => e.target.style.color = '#ef4444'} onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClipboardPage({ theme, toggleTheme }) {
  const { id } = useParams();

  useEffect(() => {
    if (id) {
      const saved = JSON.parse(localStorage.getItem('clipboard_recent') || '[]');
      const exists = saved.find(s => s.id === id);
      if (!exists) {
        const updated = [{ id, title: 'Clipboard', opened: Date.now() }, ...saved].slice(0, 10);
        localStorage.setItem('clipboard_recent', JSON.stringify(updated));
      }
    }
  }, [id]);

  if (id) return <EditorPage key={id} clipboardId={id} theme={theme} toggleTheme={toggleTheme} />;
  return <HomePage theme={theme} toggleTheme={toggleTheme} />;
}
