import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

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

function EditorToolbar({ editor }) {
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

function EditorPage({ clipboardId, theme }) {
  const [title, setTitle] = useState('');
  const [syncStatus, setSyncStatus] = useState('connecting');
  const [lastSynced, setLastSynced] = useState(null);
  const [copied, setCopied] = useState(false);
  const saveTimeoutRef = useRef(null);
  const isRemoteUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
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
      Placeholder.configure({ placeholder: 'Start typing...' }),
      TableExt.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (isRemoteUpdate.current) return;
      const html = editor.getHTML();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setSyncStatus('saving');
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await setDoc(doc(db, 'clipboards', clipboardId), {
            content: html,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          setSyncStatus('synced');
          setLastSynced(new Date());
        } catch (err) {
          console.error('Save failed:', err);
          setSyncStatus('error');
        }
      }, 800);
    },
  });

  useEffect(() => {
    if (!clipboardId || !editor) return;
    const ref = doc(db, 'clipboards', clipboardId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.title !== undefined) setTitle(data.title);
      if (data.content !== undefined && editor.getHTML() !== data.content) {
        isRemoteUpdate.current = true;
        editor.commands.setContent(data.content);
        isRemoteUpdate.current = false;
      }
      setSyncStatus('synced');
      setLastSynced(new Date());
    }, (err) => {
      console.error('Snapshot error:', err);
      setSyncStatus('error');
    });
    return () => unsub();
  }, [clipboardId, editor]);

  const updateTitle = useCallback(async (newTitle) => {
    setTitle(newTitle);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'clipboards', clipboardId), { title: newTitle, updatedAt: serverTimestamp() }, { merge: true });
      } catch (err) { console.error('Title save failed:', err); }
    }, 500);
  }, [clipboardId]);

  const copyId = () => {
    navigator.clipboard.writeText(clipboardId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColor = syncStatus === 'synced' ? '#22c55e' : syncStatus === 'saving' ? '#f59e0b' : syncStatus === 'error' ? '#ef4444' : '#94a3b8';
  const statusText = syncStatus === 'synced' ? 'Synced' : syncStatus === 'saving' ? 'Saving...' : syncStatus === 'error' ? 'Error' : 'Connecting...';

  return (
    <div className="container">
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/clipboard" className="back-link" style={{ marginBottom: 0, fontSize: '0.85rem' }}>← Back</Link>
            <input value={title} onChange={(e) => updateTitle(e.target.value)} placeholder="Untitled" style={{ background: 'transparent', border: 'none', fontSize: '1rem', fontWeight: 600, color: 'var(--text)', outline: 'none', minWidth: '120px', maxWidth: '300px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
              {statusText}
            </span>
            {lastSynced && <span>Last synced {lastSynced.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
            <button onClick={copyId} style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.72rem' }}>{copied ? '✓ Copied' : clipboardId}</button>
          </div>
        </div>
        <EditorToolbar editor={editor} />
        <ToolbarTableActions editor={editor} />
        <div style={{ minHeight: '60vh', padding: '1rem' }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function HomePage({ theme }) {
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
      const id = genId();
      const res = await fetch('/api/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', title: 'Untitled Clipboard' }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const data = await res.json();
      const cid = data.id || id;
      saveRecent(cid, 'Untitled Clipboard');
      navigate(`/clipboard/${cid}`);
    } catch (err) {
      setError('Failed to create clipboard. Try again.');
    } finally { setCreating(false); }
  };

  const openClipboard = (e) => {
    e.preventDefault();
    const id = clipboardId.trim();
    if (!id) return;
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
      <div className="card" style={{ maxWidth: '560px', margin: '2rem auto' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>📋 Clipboard</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.5rem' }}>Real-time collaborative rich text editor. Create a new clipboard or open an existing one.</p>

        <button onClick={createClipboard} disabled={creating} style={{ width: '100%', padding: '0.75rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', opacity: creating ? 0.6 : 1 }}>
          {creating ? 'Creating...' : '+ Create New Clipboard'}
        </button>

        <form onSubmit={openClipboard} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <input className="main-input" placeholder="Enter Clipboard ID..." value={clipboardId} onChange={(e) => { setClipboardId(e.target.value); setError(''); }} style={{ flex: 1, fontSize: '0.85rem', padding: '0.6rem 0.85rem', textTransform: 'uppercase' }} />
          <button type="submit" style={{ padding: '0.6rem 1.2rem', background: 'var(--success, #22c55e)', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Open</button>
        </form>

        {error && <div style={{ padding: '0.5rem 0.85rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.4rem', color: '#dc2626', fontSize: '0.8rem', marginBottom: '1rem' }}>{error}</div>}

        {recent.length > 0 && (
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Recent Clipboards</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {recent.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--input-bg)', borderRadius: '0.4rem', border: '1px solid var(--border)' }}>
                  <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => navigate(`/clipboard/${r.id}`)}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text)' }}>{r.title || 'Untitled'}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.id}</div>
                  </div>
                  <button onClick={() => removeRecent(r.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem 0.4rem' }} title="Remove">✕</button>
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
  const navigate = useNavigate();

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

  if (id) return <EditorPage key={id} clipboardId={id} theme={theme} />;
  return <HomePage theme={theme} />;
}
