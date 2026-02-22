import React, { useState } from 'react';
import './App.css';
import { encrypt, decrypt, encryptCBC, decryptCBC } from './cryptoUtil';

function App() {
  const [inputText, setInputText] = useState('');
  const [aesKey, setAesKey] = useState('');
  const [outputResult, setOutputResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState('GCM'); // 'GCM' or 'CBC'

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
      setCopied(false);
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
      setCopied(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!outputResult) return;
    navigator.clipboard.writeText(outputResult).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="container">
      <div className="card">
        <h1>AES Cipher Studio</h1>

        <div className="mode-toggle">
          <button
            className={`toggle-btn ${mode === 'GCM' ? 'active' : ''}`}
            onClick={() => { setMode('GCM'); setError(''); }}
          >
            AES/GCM/NoPadding
          </button>
          <button
            className={`toggle-btn ${mode === 'CBC' ? 'active' : ''}`}
            onClick={() => { setMode('CBC'); setError(''); }}
          >
            AES/CBC/PKCS5Padding
          </button>
        </div>

        {error && (
          <div className="error-message">
            <span>⚠️ {error}</span>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="inputText">Input Message</label>
          <textarea
            id="inputText"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={mode === 'GCM' ? "Type message or paste encrypted (Base64)..." : "Type message or paste encrypted..."}
          />
        </div>

        <div className="form-group">
          <label htmlFor="aesKey">{mode === 'GCM' ? 'AES Key (Base64)' : 'AES Key (Raw String)'}</label>
          <input
            id="aesKey"
            type="text"
            value={aesKey}
            onChange={(e) => setAesKey(e.target.value)}
            placeholder={mode === 'GCM' ? "Enter 256-bit Base64 key..." : "Enter key string (min 16 chars recommended)..."}
          />
        </div>

        <div className="button-group">
          <button
            className="btn-encrypt"
            onClick={handleEncrypt}
            disabled={loading}
          >
            {loading ? <div className="loader"></div> : 'Secure Encrypt'}
          </button>
          <button
            className="btn-decrypt"
            onClick={handleDecrypt}
            disabled={loading}
          >
            {loading ? <div className="loader"></div> : 'Secure Decrypt'}
          </button>
        </div>

        <div className="output-container">
          <div className="output-header">
            <label>Output Result</label>
            {outputResult && (
              <button className="copy-btn" onClick={handleCopy}>
                {copied ? '✓ Copied!' : 'Copy Result'}
              </button>
            )}
          </div>
          <textarea
            className="output-area"
            value={outputResult}
            readOnly
            placeholder="Authentication Tag + Ciphertext will appear here..."
          />
        </div>

        <footer className="author-footer">
          <p>Built by <strong>Dikshit Sharma</strong></p>
          <p><a href="mailto:dikshit.sharma2580@gmail.com">dikshit.sharma2580@gmail.com</a></p>
        </footer>
      </div>
    </div>
  );
}

export default App;
