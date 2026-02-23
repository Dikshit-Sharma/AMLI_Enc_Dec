import React, { useState } from 'react';
import './App.css';
import { encrypt, decrypt, encryptCBC, decryptCBC, generateAESKeyHex, hexToBase64, base64ToHex } from './cryptoUtil';

function App() {
  const [inputText, setInputText] = useState('');
  const [aesKey, setAesKey] = useState('');
  const [outputResult, setOutputResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState('GCM'); // 'GCM' or 'CBC'
  const [hexKeyConverter, setHexKeyConverter] = useState('');
  const [base64KeyConverter, setBase64KeyConverter] = useState('');
  const [showModal, setShowModal] = useState(false);

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
          <button
            className="btn-generate"
            onClick={handleGenerateKey}
          >
            ✨ Generate AES Key
          </button>
        </div>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>AES Key Generator & Converter</h2>
                <button className="close-modal" onClick={() => setShowModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Generated Hex Key</label>
                  <div className="input-with-copy">
                    <input
                      type="text"
                      value={hexKeyConverter}
                      onChange={handleHexChange}
                      placeholder="Enter Hex key..."
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Base64 Encoded Key</label>
                  <div className="input-with-copy">
                    <input
                      type="text"
                      value={base64KeyConverter}
                      onChange={handleBase64Change}
                      placeholder="Base64 will appear here..."
                    />
                  </div>
                </div>
                <p className="hint-text">This Base64 is the literal encoding of the hex string.</p>
                <div className="modal-actions">
                  <button className="btn-primary" onClick={useConvertedKey}>
                    Use this Key in Cipher
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
