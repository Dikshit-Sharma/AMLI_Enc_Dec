import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { runCommand, NEED_PASSWORD } from './commands';
import { getDSBanner } from './neofetch';
import { logAnalyticsEvent } from '../firebase';
import {
  fetchArtifacts,
  fetchArtifactStats,
  fetchCredentials,
  fetchBSAEntries,
  toDate,
} from '../api';
import {
  generateAESKeyHex,
  encrypt,
  decrypt,
} from '../cryptoUtil';
import { exportToObsidian } from '../obsidianExport';

const ESC = String.fromCharCode(27);

/** Parse ANSI escape sequences from a string into styled spans */
function renderLine(line, key) {
  if (Array.isArray(line)) return line.map((l, i) => <span key={i}>{l}</span>);
  const text = String(line);
  const elements = [];
  let currentColor = null;
  let plain = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === ESC && text[i + 1] === '[') {
      // Flush accumulated plain text
      if (plain) {
        elements.push(<span key={`${key}-t${elements.length}`} style={currentColor ? { color: currentColor } : undefined}>{plain}</span>);
        plain = '';
      }
      // Find the end of the escape sequence (letter)
      let j = i + 2;
      while (j < text.length && !/[a-zA-Z]/.test(text[j])) j++;
      const seq = text.slice(i + 2, j + 1);
      const codes = seq.slice(0, -1).split(';').map((n) => parseInt(n, 10));
      if (codes.includes(0)) {
        currentColor = null;
      } else {
        const c = colorFromCodeInt(codes);
        currentColor = c !== null ? c : currentColor;
      }
      i = j + 1;
    } else {
      plain += text[i];
      i++;
    }
  }
  if (plain) {
    elements.push(<span key={`${key}-t${elements.length}`} style={currentColor ? { color: currentColor } : undefined}>{plain}</span>);
  }
  return <React.Fragment key={key}>{elements.length ? elements : text}</React.Fragment>;
}

function colorFromCodeInt(codes) {
  const has = (n) => codes.includes(n);
  if (has(31)) return 'var(--error)';
  if (has(32)) return '#10b981';
  if (has(33)) return '#f59e0b';
  if (has(34)) return '#3b82f6';
  if (has(35)) return '#a855f7';
  if (has(36)) return '#22d3ee';
  if (has(37)) return 'var(--text)';
  return null;
}

// State for ds password prompt
const DS_PROMPT_NONE = 'none';
const DS_PROMPT_AWAITING_PASSWORD = 'awaiting_password';
const DS_PROMPT_AWAITING_COMMAND = 'awaiting_command';

export default function TerminalCLI({ theme, toggleTheme, onClose, isOpen, navigate }) {
  const [history, setHistory] = useState([]); // { type: 'cmd'|'out'|'err'|'info'|'sys', text }
  const [input, setInput] = useState('');
  const [loggedIn, setLoggedIn] = useState(
    sessionStorage.getItem('cli_auth') === 'true'
  );
  const [dsPromptState, setDsPromptState] = useState(DS_PROMPT_NONE);
  const [dsPendingCmd, setDsPendingCmd] = useState('');

  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const histRef = useRef([]);
  const histPosRef = useRef(-1);
  const bannerShownRef = useRef(false);

  const print = useCallback((lines) => {
    const arr = Array.isArray(lines) ? lines : [lines];
    setHistory((prev) => [...prev, ...arr.map((t) => ({ type: 'out', text: String(t) }))]);
  }, []);

  const printErr = useCallback((text) => {
    setHistory((prev) => [...prev, { type: 'err', text: String(text) }]);
  }, []);

  const printInfo = useCallback((text) => {
    setHistory((prev) => [...prev, { type: 'info', text: String(text) }]);
  }, []);

  const printSys = useCallback((text) => {
    // System messages (like "Navigating to...") that should NOT be parsed as commands
    setHistory((prev) => [...prev, { type: 'sys', text: String(text) }]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    bannerShownRef.current = false;
  }, []);

  const getHistory = useCallback(() => histRef.current, []);

  const close = useCallback(() => onClose && onClose(), [onClose]);

  // Show the banner once on first open
  useEffect(() => {
    if (isOpen && !bannerShownRef.current) {
      bannerShownRef.current = true;
      const banner = getBannerLines();
      const intro = [
        '',
        colorizeCode('AMLI-SH 1.0.0 — linux-like CLI for the AMLI platform', 'cyan'),
        '',
        'A few commands to get started:',
        `  ${colorizeCode('help', 'green')}              show all commands`,
        `  ${colorizeCode('help ds', 'green')}           details about the sudo (ds) command`,
        `  ${colorizeCode('ds password <secret>', 'green')}   unlock admin mode`,
        `  ${colorizeCode('open library', 'green')}     navigate to a page`,
        `  ${colorizeCode('list credentials', 'green')} list records`,
        `  ${colorizeCode('cipher keygen', 'green')}     generate an AES key`,
        '',
      ];
      setHistory((prev) => [
        ...prev,
        ...banner.map((l) => ({ type: 'info', text: l })),
        ...intro.map((l) => ({ type: 'info', text: l })),
      ]);
      logAnalyticsEvent('cli_open', {});
    }
  }, [isOpen]);

  // Autoscroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  // Focus input
  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  // Record history on command execution
  useEffect(() => {
    histRef.current = history.filter((h) => h.type === 'cmd').map((h) => h.text);
  }, [history]);

  const printIn = useCallback((text) => {
    setHistory((prev) => [...prev, { type: 'info', text }]);
  }, []);

  const context = useMemo(() => ({
    print,
    printErr,
    printInfo,
    printSys,
    clearHistory,
    getHistory,
    close,
    navigate: (path) => {
      if (navigate) {
        printSys(`Navigating to ${path} ...`);
        navigate(path);
      }
    },
    isLoggedIn: () => loggedIn,
    setLoggedIn: (v) => {
      setLoggedIn(v);
      sessionStorage.setItem('cli_auth', v ? 'true' : 'false');
    },
    authenticate: async (password) => {
      try {
        const res = await fetch('/api/auth-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (data.valid) {
          sessionStorage.setItem('cli_auth', 'true');
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    showBanner: () => {
      setHistory((prev) => [...prev, ...getBannerLines().map((l) => ({ type: 'info', text: l }))]);
      return [];
    },
    listArtifacts: async (args) => {
      const limit = parseFlag(args, '--limit', 20);
      try {
        const res = await fetchArtifacts({ limit });
        const items = res.artifacts || [];
        if (!items.length) return ['No artifacts found.'];
        const rows = items.map((a) => {
          const name = a.apiName || 'Unnamed';
          return `${String(a.jiraTicket || '').padEnd(12)} ${name.padEnd(30)} ${String(a.env || '').padEnd(5)} ${a.encryption || 'Disabled'}`;
        });
        return [colorizeCode('Artifacts:', 'bold'), ...rows, `Total: ${res.total ?? items.length}`];
      } catch (e) {
        return [`Failed to fetch artifacts: ${e.message}`];
      }
    },
    listCredentials: async (args) => {
      const env = parseFlag(args, '--env', 'DEV').toUpperCase();
      try {
        const res = await fetchCredentials(env);
        const items = res.credentials || [];
        if (!items.length) return [`No credentials for ${env}.`];
        const rows = items.map((c) => {
          return `${String(c.soaAppId || '').padEnd(12)} ${String(c.apiName || '').padEnd(30)} ${env} masked=true`;
        });
        return [colorizeCode(`Credentials (${env}):`, 'bold'), ...rows, `Count: ${items.length}`];
      } catch (e) {
        return [`Failed to fetch credentials: ${e.message}`];
      }
    },
    listBSA: async () => {
      try {
        const res = await fetchBSAEntries();
        const items = res.entries || [];
        if (!items.length) return ['No BSA entries found.'];
        const rows = items.map((b) => {
          const consumers = (b.consumers || []).map((c) => c.name).join(', ');
          return `${b.api.padEnd(25)} ${consumers}`;
        });
        return [colorizeCode('BSA Entries:', 'bold'), ...rows];
      } catch (e) {
        return [`Failed to fetch BSA entries: ${e.message}`];
      }
    },
    listClipboards: async () => {
      try {
        const res = await fetch('/api/clipboard');
        const data = await res.json();
        const items = data.clipboards || [];
        if (!items.length) return ['No clipboards found.'];
        const rows = items.map((c) => `${String(c.id || '').padEnd(12)} ${c.title || 'Untitled'} v${c.version || 0}`);
        return [colorizeCode('Clipboards:', 'bold'), ...rows, `Count: ${items.length}`];
      } catch (e) {
        return [`Failed to fetch clipboards: ${e.message}`];
      }
    },
    search: async (rest) => {
      const q = rest.trim();
      try {
        const [artRes, credRes] = await Promise.all([
          fetchArtifacts({ search: q }),
          Promise.all(['DEV', 'UAT', 'PROD'].map((e) => fetchCredentials(e).catch(() => ({ credentials: [] })))),
        ]);
        const lib = artRes.artifacts || [];
        const creds = [...new Set(credRes.flatMap((r) => r.credentials || []))];
        const out = [];
        if (lib.length) {
          out.push(colorizeCode('Library:', 'bold'));
          lib.forEach((a) => out.push(`  ${a.jiraTicket || a.apiName} — ${a.apiName} (${a.env})`));
        }
        if (creds.length) {
          const matched = creds.filter((c) =>
            (c.soaAppId || '').toLowerCase().includes(q.toLowerCase()) ||
            (c.apiName || '').toLowerCase().includes(q.toLowerCase())
          );
          if (matched.length) {
            out.push(colorizeCode('Credentials:', 'bold'));
            matched.forEach((c) => out.push(`  ${c.soaAppId} — ${c.apiName} (${c.env})`));
          }
        }
        if (!out.length) return [`No results for "${q}".`];
        return out;
      } catch (e) {
        return [`Search failed: ${e.message}`];
      }
    },
    stats: async () => {
      try {
        const res = await fetchArtifactStats();
        const env = res.envCounts || {};
        const lines = [
          colorizeCode('Dashboard statistics:', 'bold'),
          `Total artifacts: ${res.total ?? 0}`,
          `Environments:`,
          `  DEV: ${env.DEV ?? 0}  UAT: ${env.UAT ?? 0}  PROD: ${env.PROD ?? 0}`,
          '',
          colorizeCode('Recent artifacts:', 'bold'),
        ];
        (res.recent || []).forEach((a) => {
          lines.push(`  ${a.jiraTicket || a.apiName} — ${a.apiName} (${a.env}) ${fmtT(a.timestamp)}`);
        });
        return lines;
      } catch (e) {
        return [`Stats failed: ${e.message}`];
      }
    },
    cipher: async (action, args) => {
      if (action === 'keygen') {
        const key = generateAESKeyHex();
        const b64 = btoa(key);
        return [
          colorizeCode('Generated AES key:', 'bold'),
          `  HEX:  ${key}`,
          `  B64:  ${b64}`,
        ];
      }
      const key = parseFlag(args, '--key', '');
      const data = parseFlag(args, '--data', '');
      if (!key) return [colorizeCode('cipher: --key is required', 'red')];
      if (!data) return [colorizeCode('cipher: --data is required', 'yellow')];
      try {
        if (action === 'encrypt') {
          const b64 = await encrypt(data, key);
          return [colorizeCode('Encrypted payload:', 'bold'), b64];
        }
        if (action === 'decrypt') {
          const plain = await decrypt(data, key);
          return [colorizeCode('Decrypted payload:', 'bold'), plain];
        }
      } catch (e) {
        return [`cipher ${action} failed: ${e.message}`];
      }
      return ['Unknown cipher action'];
    },
    theme: (mode) => {
      if (mode === 'light' && theme !== 'light') { toggleTheme(); return ['Theme set to light.']; }
      if (mode === 'dark' && theme !== 'dark') { toggleTheme(); return ['Theme set to dark.']; }
      if (mode === 'toggle') { toggleTheme(); return [`Theme toggled to ${theme === 'light' ? 'dark' : 'light'}.`]; }
      return [`Theme is already ${theme}.`];
    },
    triggerObsidianExport: async () => {
      printIn('Starting Obsidian export...');
      try {
        await exportToObsidian({ onProgress: (msg) => printIn(msg) });
        return [colorizeCode('✓ Obsidian vault exported.', 'green')];
      } catch (e) {
        return [`Obsidian export failed: ${e.message}`];
      }
    },
  }), [print, printErr, printInfo, printSys, clearHistory, getHistory, close, loggedIn, theme, toggleTheme, navigate, printIn]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const line = input.trim();
      if (!line) return;
      setHistory((prev) => [...prev, { type: 'cmd', text: `$ ${line}` }]);
      setInput('');
      histRef.current.push(line);
      histPosRef.current = -1;

      // If waiting for ds password
      if (dsPromptState === DS_PROMPT_AWAITING_PASSWORD) {
        setHistory((prev) => [...prev, { type: 'info', text: '********' }]); // mask password in history
        // We'll handle the password after state update
        setTimeout(async () => {
          try {
            const ok = await context.authenticate(line);
            if (ok) {
              setLoggedIn(true);
              setDsPromptState(DS_PROMPT_NONE);
              // Now run the pending command
              const pendingOut = await runCommand(dsPendingCmd, context);
              if (pendingOut && pendingOut.length) {
                setHistory((prev) => [...prev, ...pendingOut.map((t) => ({ type: 'out', text: String(t) }))]);
              }
            } else {
              setHistory((prev) => [...prev, { type: 'err', text: 'Incorrect password.' }]);
            }
          } catch (err) {
            setHistory((prev) => [...prev, { type: 'err', text: `Error: ${err.message}` }]);
          }
        }, 0);
        return;
      }

      // Normal command
      setHistory((prev) => [...prev, { type: 'cmd', text: `$ ${line}` }]);
      setInput('');
      histRef.current.push(line);
      histPosRef.current = -1;

      setTimeout(async () => {
        try {
          const out = await runCommand(line, context);
          // Handle password prompt request
          if (out && out[NEED_PASSWORD]) {
            const { pendingCmd } = out;
            setDsPendingCmd(pendingCmd);
            setDsPromptState(DS_PROMPT_AWAITING_PASSWORD);
            // Show the password prompt line
            setHistory((prev) => [...prev, { type: 'info', text: 'ds password: ' }]);
            return;
          }
          if (out && out.length) {
            setHistory((prev) => [...prev, ...out.map((t) => ({ type: 'out', text: String(t) }))]);
          }
        } catch (err) {
          setHistory((prev) => [...prev, { type: 'err', text: `Error: ${err.message}` }]);
        }
      }, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const h = histRef.current;
      if (!h.length) return;
      histPosRef.current = Math.min(histPosRef.current + 1, h.length - 1);
      setInput(h[h.length - 1 - histPosRef.current] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const h = histRef.current;
      histPosRef.current = Math.max(histPosRef.current - 1, -1);
      setInput(histPosRef.current >= 0 ? (h[h.length - 1 - histPosRef.current] || '') : '');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (dsPromptState !== DS_PROMPT_NONE) {
        setDsPromptState(DS_PROMPT_NONE);
        setDsPendingCmd('');
      } else {
        onClose && onClose();
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clearHistory();
      setHistory((prev) => [...prev, { type: 'info', text: 'AMLI-SH 1.0.0' }]);
    }
  }, [input, context, onClose, clearHistory, dsPromptState, dsPendingCmd]);

  const prompt = (
    <span className="cli-prompt">
      <span className="cli-prompt-user">{loggedIn ? 'admin' : 'guest'}</span>
      <span className="cli-prompt-at">@</span>
      <span className="cli-prompt-host">amli</span>
      <span className="cli-prompt-sep">$</span>
    </span>
  );

  // Effect for ds command handling - when ds command requests password
  useEffect(() => {
    // This is handled in runCommand via context functions
  }, []);

  return (
    <div className="cli-fullscreen" onClick={() => inputRef.current && inputRef.current.focus()}>
      <div className="cli-window-full">
        <div className="cli-titlebar">
          <div className="cli-dots">
            <span className="cli-dot cli-dot-red" onClick={onClose} title="Close" />
            <span className="cli-dot cli-dot-yellow" onClick={clearHistory} title="Clear" />
            <span className="cli-dot cli-dot-green" onClick={() => inputRef.current && inputRef.current.focus()} title="Focus" />
          </div>
          <div className="cli-title">AMLI-SH — ds@amli</div>
          <div className="cli-spacer" />
        </div>
        <div className="cli-body" ref={scrollRef}>
          {/* Banner area - rendered as part of history on first open */}
          {history.map((h, i) => {
            if (h.type === 'cmd') {
              return (
                <div className="cli-line cli-line-cmd" key={i}>
                  {prompt}
                  <span className="cli-cmd-text">{h.text.slice(2)}</span>
                </div>
              );
            }
            if (h.type === 'err') {
              return (
                <div className="cli-line cli-line-err" key={i}>
                  {renderLine(h.text, `err-${i}`)}
                </div>
              );
            }
            if (h.type === 'info') {
              return (
                <div className="cli-line cli-line-info" key={i}>
                  {renderLine(h.text, `info-${i}`)}
                </div>
              );
            }
            if (h.type === 'sys') {
              return (
                <div className="cli-line cli-line-sys" key={i}>
                  {renderLine(h.text, `sys-${i}`)}
                </div>
              );
            }
            return (
              <div className="cli-line" key={i}>
                {renderLine(h.text, `out-${i}`)}
              </div>
            );
          })}
          {/* ds password prompt inline */}
          {dsPromptState === DS_PROMPT_AWAITING_PASSWORD && (
            <div className="cli-line cli-line-prompt" key="ds-prompt">
              {prompt}
              <span className="cli-cmd-text">ds password: </span>
            </div>
          )}
          <div className="cli-input-row">
            {prompt}
            <input
              ref={inputRef}
              className="cli-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              type={dsPromptState === DS_PROMPT_AWAITING_PASSWORD ? 'password' : 'text'}
            />
            <span className="cli-cursor" />
          </div>
        </div>
      </div>
    </div>
  );
}

function parseFlag(args, flag, def) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return def;
}

function fmtT(ts) {
  const d = toDate(ts);
  return d ? d.toISOString().slice(0, 10) : '';
}

function colorizeCode(text, style) {
  if (style === 'bold') return `\u001b[1m${text}\u001b[0m`;
  if (style === 'red') return `\u001b[31m${text}\u001b[0m`;
  if (style === 'yellow') return `\u001b[33m${text}\u001b[0m`;
  if (style === 'cyan') return `\u001b[36m${text}\u001b[0m`;
  if (style === 'green') return `\u001b[32m${text}\u001b[0m`;
  return text;
}

function getBannerLines() {
  const b = getDSBanner();
  const LOGO_W = 80;
  return b.map((row) => {
    if (row.isSwatch) {
      // Color the swatch blocks with ANSI codes
      const blocks = row.info.trim().split(/\s+/);
      const colors = [
        '\u001b[38;2;99;102;241m',  // indigo
        '\u001b[38;2;34;211;238m',  // cyan
        '\u001b[38;2;16;185;129m',  // emerald
        '\u001b[38;2;245;158;11m',  // amber
        '\u001b[38;2;244;63;94m',   // rose
      ];
      return blocks.map((block, idx) => {
        const color = colors[idx % colors.length] || '\u001b[36m';
        return `${color}${block}\u001b[0m`;
      }).join('   ');
    }
    const logo = row.logo || '';
    return logo + ' '.repeat(Math.max(2, LOGO_W - displayWidth(logo))) + row.info;
  });
}

// Approximate terminal display width (block chars count as 1, wide chars as 2)
function displayWidth(str) {
  let w = 0;
  for (const ch of str) {
    if (/[\u{3000}-\u{9FFF}\u{FF00}-\u{FFEF}\u{2580}-\u{259F}\u{2500}-\u{257F}]/u.test(ch)) w += 2;
    else w += 1;
  }
  return w;
}