import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { encrypt, decrypt, encryptCBC, decryptCBC, generateAESKeyHex, hexToBase64, base64ToHex } from './cryptoUtil';
import SmartTextArea from './SmartTextArea';
import { logAnalyticsEvent } from './firebase';

const KEY_HISTORY_KEY = 'cipher_key_history';
const MAX_KEY_HISTORY = 5;

function loadKeyHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY_HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveKeyHistory(keys) {
  try { localStorage.setItem(KEY_HISTORY_KEY, JSON.stringify(keys.slice(0, MAX_KEY_HISTORY))); }
  catch { /* quota exceeded */ }
}

export default function CipherTool({ theme, toggleTheme }) {
  const [inputText, setInputText] = useState('');
  const [aesKey, setAesKey] = useState('');
  const [outputResult, setOutputResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('GCM');
  const [isSideBySide, setIsSideBySide] = useState(true);
  const [copied, setCopied] = useState(false);
  const [keyHistory, setKeyHistory] = useState(loadKeyHistory);
  const [showKeyHistory, setShowKeyHistory] = useState(false);
  const [hexKeyConverter, setHexKeyConverter] = useState('');
  const [base64KeyConverter, setBase64KeyConverter] = useState('');
  const [showModal, setShowModal] = useState(false);

  const inputLen = inputText.length;
  const outputLen = outputResult.length;

  const validate = useCallback(() => {
    if (!inputText.trim()) { setError('Text cannot be empty'); return false; }
    if (!aesKey.trim()) { setError('Key cannot be empty'); return false; }
    if (mode === 'GCM') {
      try { atob(aesKey); } catch { setError('GCM mode requires a valid Base64 key'); return false; }
    } else if (mode === 'CBC') {
      if (![16, 24, 32].includes(aesKey.length)) {
        setError('CBC mode requires a raw key of 16, 24, or 32 characters'); return false;
      }
    }
    return true;
  }, [inputText, aesKey, mode]);

  const addKeyToHistory = useCallback((key) => {
    setKeyHistory(prev => {
      const filtered = prev.filter(k => k !== key);
      const updated = [key, ...filtered].slice(0, MAX_KEY_HISTORY);
      saveKeyHistory(updated);
      return updated;
    });
  }, []);

  const handleEncrypt = async () => {
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const result = mode === 'GCM' ? await encrypt(inputText, aesKey) : await encryptCBC(inputText, aesKey);
      setOutputResult(result);
      addKeyToHistory(aesKey);
      logAnalyticsEvent('encrypt', { mode });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleDecrypt = async () => {
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const result = mode === 'GCM' ? await decrypt(inputText, aesKey) : await decryptCBC(inputText, aesKey);
      setOutputResult(result);
      addKeyToHistory(aesKey);
      logAnalyticsEvent('decrypt', { mode });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleSwap = () => {
    if (!outputResult) return;
    setInputText(outputResult);
    setOutputResult('');
    setError('');
  };

  const handleClear = () => {
    setInputText('');
    setOutputResult('');
    setError('');
  };

  const handleCopy = async () => {
    if (!outputResult) return;
    try {
      await navigator.clipboard.writeText(outputResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  const handleGenerateKey = () => {
    const newHexKey = generateAESKeyHex();
    setHexKeyConverter(newHexKey);
    setBase64KeyConverter(hexToBase64(newHexKey));
    setShowModal(true);
  };

  const handleHexChange = (e) => {
    const hex = e.target.value;
    setHexKeyConverter(hex);
    setBase64KeyConverter(hex.trim() ? hexToBase64(hex) : '');
  };

  const handleBase64Change = (e) => {
    const b64 = e.target.value;
    setBase64KeyConverter(b64);
    if (b64.trim()) {
      const hex = base64ToHex(b64);
      if (hex) setHexKeyConverter(hex);
    }
  };

  const useConvertedKey = () => {
    if (base64KeyConverter) {
      setAesKey(base64KeyConverter);
      setMode('GCM');
      setError('');
      setShowModal(false);
    }
  };

  const handleKeySelect = (key) => {
    setAesKey(key);
    setShowKeyHistory(false);
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleEncrypt();
    }
  };

  return (
    <div className="container">
      <div className="card workspace-fullscreen">
        <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className={`btn-layout-toggle ${isSideBySide ? 'active' : ''}`}
              onClick={() => setIsSideBySide(!isSideBySide)}
            >
              {isSideBySide ? '🔳 Stack' : '🔲 Side'}
            </button>
          </div>
        </div>

        <h1 style={{ textAlign: 'center' }}>CIPHER TOOL</h1>

        <div className="mode-toggle" style={{ marginBottom: '2rem' }}>
          <button className={`toggle-btn ${mode === 'GCM' ? 'active' : ''}`} onClick={() => { setMode('GCM'); setError(''); }}>AES/GCM</button>
          <button className={`toggle-btn ${mode === 'CBC' ? 'active' : ''}`} onClick={() => { setMode('CBC'); setError(''); }}>AES/CBC</button>
        </div>

        {error && <div className="error-message"><span>⚠️ {error}</span></div>}

        <div className="cipher-key-row">
          <div className="cipher-key-input-wrap">
            <label className="field-label">{mode === 'GCM' ? 'AES KEY (BASE64)' : 'AES KEY (RAW STRING)'}</label>
            <div className="cipher-key-field">
              <input
                id="aesKey" type="text" className="main-input" value={aesKey}
                onChange={(e) => setAesKey(e.target.value)}
                onFocus={() => setShowKeyHistory(true)}
                onBlur={() => setTimeout(() => setShowKeyHistory(false), 200)}
                placeholder={mode === 'GCM' ? 'Base64-encoded 256-bit key...' : '16, 24, or 32 character key...'}
                onKeyDown={handleKeyDown}
              />
              <button className="cipher-key-gen" onClick={handleGenerateKey} title="Generate new key">✨</button>
              {keyHistory.length > 0 && (
                <button className="cipher-key-history-btn" onClick={() => setShowKeyHistory(!showKeyHistory)} title="Recent keys">🕐</button>
              )}
            </div>
            {showKeyHistory && keyHistory.length > 0 && (
              <div className="cipher-key-dropdown">
                {keyHistory.map((key, i) => (
                  <button key={i} className="cipher-key-dropdown-item" onMouseDown={() => handleKeySelect(key)}>
                    <span className="cipher-key-preview">{key.slice(0, 24)}...</span>
                    <span className="cipher-key-index">{i + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="cipher-actions-strip">
            <button className="btn-encrypt cipher-action-btn" onClick={handleEncrypt} disabled={loading}>
              {loading ? <div className="loader tiny" /> : '🔒 Encrypt'}
            </button>
            <button className="btn-decrypt cipher-action-btn" onClick={handleDecrypt} disabled={loading}>
              {loading ? <div className="loader tiny" /> : '🔓 Decrypt'}
            </button>
            <button className="btn-swap cipher-action-btn" onClick={handleSwap} disabled={!outputResult} title="Swap input/output">
              ↕ Swap
            </button>
            <button className="btn-clear cipher-action-btn" onClick={handleClear} title="Clear all">
              ✕ Clear
            </button>
          </div>
        </div>

        <div className={`workspace-wrapper ${isSideBySide ? 'workspace-wrapper--side-by-side' : ''}`}>
          <div className="workspace-column">
            <div className="cipher-col-header">
              <label className="field-label">INPUT</label>
              <span className="cipher-char-count">{inputLen} {inputLen === 1 ? 'char' : 'chars'}</span>
            </div>
            <SmartTextArea
              id="inputText" value={inputText} onChange={setInputText}
              dark={theme === 'dark'} maxHeight="100%"
              placeholder="Type message, paste payload, or enter encrypted text..."
            />
          </div>

          <div className="workspace-column">
            <div className="cipher-col-header">
              <label className="field-label">OUTPUT</label>
              <div className="cipher-col-header-right">
                <span className="cipher-char-count">{outputLen} {outputLen === 1 ? 'char' : 'chars'}</span>
                {outputResult && (
                  <button className={`cipher-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
                    {copied ? '✓ Copied' : '📋 Copy'}
                  </button>
                )}
              </div>
            </div>
            <SmartTextArea
              value={outputResult} onChange={setOutputResult} readOnly
              dark={theme === 'dark'} maxHeight="100%"
              placeholder="Result will appear here..."
            />
          </div>
        </div>

        <div className="cipher-footer-hints">
          <span>Ctrl+Enter to encrypt</span>
          <span>Swap to chain encrypt/decrypt</span>
          <span>{mode} mode</span>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>AES Key Converter</h2><button className="close-modal" onClick={() => setShowModal(false)}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Hex Key</label><input type="text" value={hexKeyConverter} onChange={handleHexChange} /></div>
              <div className="form-group"><label>Base64 Key</label><input type="text" value={base64KeyConverter} onChange={handleBase64Change} /></div>
              <div className="modal-actions"><button className="btn-primary" onClick={useConvertedKey}>Use Key</button></div>
            </div>
          </div>
        </div>
      )}

      <footer className="footer-minimal">
        <p>Built by <strong>Dikshit Sharma</strong> | <a href="mailto:dikshit.sharma2580@gmail.com">dikshit.sharma2580@gmail.com</a></p>
      </footer>
    </div>
  );
}
