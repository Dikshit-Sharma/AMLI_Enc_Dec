import React, { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { logAnalyticsEvent } from './firebase';
import './App.css';
import SmartTextArea from './SmartTextArea';
import HomePage from './HomePage';
import ArtifactsPage from './ArtifactsPage';
import { encrypt, decrypt, encryptCBC, decryptCBC, generateAESKeyHex, hexToBase64, base64ToHex } from './cryptoUtil';
import LibraryPage from './LibraryPage';

function App() {
  const [inputText, setInputText] = useState('');
  const [aesKey, setAesKey] = useState('');
  const [outputResult, setOutputResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('GCM'); // 'GCM' or 'CBC'
  const [isSideBySide, setIsSideBySide] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('amli-theme') || 'dark');
  const [hexKeyConverter, setHexKeyConverter] = useState('');
  const [base64KeyConverter, setBase64KeyConverter] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Apply theme to document
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('amli-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
    logAnalyticsEvent('theme_toggle', { theme: theme === 'light' ? 'dark' : 'light' });
  };

  const validate = () => {
    if (!inputText.trim()) {
      setError('Text cannot be empty');
      return false;
    }
    if (!aesKey.trim()) {
      setError('Key cannot be empty');
      return false;
    }
    if (mode === 'GCM') {
      try {
        atob(aesKey);
      } catch (e) {
        setError('GCM mode requires a valid Base64 key');
        return false;
      }
    } else if (mode === 'CBC') {
      if (![16, 24, 32].includes(aesKey.length)) {
        setError('CBC mode requires a raw key of 16, 24, or 32 characters');
        return false;
      }
    }
    return true;
  };

  const handleEncrypt = async () => {
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const result = mode === 'GCM'
        ? await encrypt(inputText, aesKey)
        : await encryptCBC(inputText, aesKey);
      setOutputResult(result);
      logAnalyticsEvent('encrypt', { mode });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDecrypt = async () => {
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const result = mode === 'GCM'
        ? await decrypt(inputText, aesKey)
        : await decryptCBC(inputText, aesKey);
      setOutputResult(result);
      logAnalyticsEvent('decrypt', { mode });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
    if (hex.trim()) {
      setBase64KeyConverter(hexToBase64(hex));
    } else {
      setBase64KeyConverter('');
    }
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

  return (
    <Routes>
      <Route path="/" element={<HomePage theme={theme} toggleTheme={toggleTheme} />} />
      <Route path="/artifacts" element={<ArtifactsPage theme={theme} toggleTheme={toggleTheme} />} />
      <Route path="/library" element={<LibraryPage theme={theme} toggleTheme={toggleTheme} />} />
      <Route path="/cipher" element={
        <div className="container">
          <div className="card">
            <div className="top-nav-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link to="/" className="back-link" style={{ marginBottom: 0 }}>← Back</Link>
                <button className="theme-toggle" onClick={toggleTheme}>
                  {theme === 'light' ? '🌙' : '☀️'}
                </button>
              </div>
              <button
                className={`btn-layout-toggle ${isSideBySide ? 'active' : ''}`}
                onClick={() => setIsSideBySide(!isSideBySide)}
              >
                {isSideBySide ? '🔳 Stack' : '🔲 Side'}
              </button>
            </div>

            <h1>CIPHER TOOL</h1>

            <div className="mode-toggle" style={{ marginBottom: '2rem' }}>
              <button className={`toggle-btn ${mode === 'GCM' ? 'active' : ''}`} onClick={() => { setMode('GCM'); setError(''); }}>AES/GCM</button>
              <button className={`toggle-btn ${mode === 'CBC' ? 'active' : ''}`} onClick={() => { setMode('CBC'); setError(''); }}>AES/CBC</button>
            </div>

            {error && <div className="error-message"><span>⚠️ {error}</span></div>}

            <div className={`workspace-wrapper ${isSideBySide ? 'workspace-wrapper--side-by-side' : ''}`}>
              <div className="workspace-column">
                <label className="field-label">INPUT MESSAGE</label>
                <SmartTextArea
                  id="inputText"
                  value={inputText}
                  onChange={setInputText}
                  dark={theme === 'dark'}
                  maxHeight="100%"
                  placeholder="Type message or paste payload..."
                />
              </div>

              {isSideBySide ? (
                <div className="side-controls">
                  <div className="side-controls__input-group">
                    <label className="field-label">{mode === 'GCM' ? 'AES KEY (BASE64)' : 'AES KEY (RAW)'}</label>
                    <input id="aesKey" type="text" className="main-input" value={aesKey} onChange={(e) => setAesKey(e.target.value)} placeholder="Key..." />
                  </div>
                  <div className="side-controls__actions">
                    <button className="btn-encrypt" onClick={handleEncrypt} disabled={loading}>{loading ? <div className="loader tiny"></div> : 'Encrypt'}</button>
                    <button className="btn-decrypt" onClick={handleDecrypt} disabled={loading}>{loading ? <div className="loader tiny"></div> : 'Decrypt'}</button>
                    <button className="btn-generate" onClick={handleGenerateKey}>✨ New Key</button>
                  </div>
                </div>
              ) : (
                <div className="central-controls">
                  <div className="form-group">
                    <label className="field-label">{mode === 'GCM' ? 'AES KEY (BASE64)' : 'AES KEY (RAW STRING)'}</label>
                    <input id="aesKey" type="text" className="main-input" value={aesKey} onChange={(e) => setAesKey(e.target.value)} placeholder="Enter AES key..." />
                  </div>
                  <div className="button-group">
                    <button className="btn-encrypt" onClick={handleEncrypt} disabled={loading}>{loading ? <div className="loader"></div> : 'Secure Encrypt'}</button>
                    <button className="btn-decrypt" onClick={handleDecrypt} disabled={loading}>{loading ? <div className="loader"></div> : 'Secure Decrypt'}</button>
                    <button className="btn-generate" onClick={handleGenerateKey}>✨ Generate Key</button>
                  </div>
                </div>
              )}

              <div className="workspace-column">
                <label className="field-label">OUTPUT RESULT</label>
                <SmartTextArea
                  value={outputResult}
                  onChange={setOutputResult}
                  readOnly
                  dark={theme === 'dark'}
                  maxHeight="100%"
                  placeholder="Result will appear here..."
                />
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

            <footer className="author-footer" style={{ marginTop: '1rem', padding: '0.5rem 0' }}>
              <p>Built by <strong>Dikshit Sharma</strong> | <a href="mailto:dikshit.sharma2580@gmail.com">dikshit.sharma2580@gmail.com</a></p>
            </footer>
          </div>
        </div>
      } />
      <Route path="/library" element={<LibraryPage />} />
    </Routes>
  );
}

export default App;
