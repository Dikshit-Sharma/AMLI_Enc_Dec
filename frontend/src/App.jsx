import React, { useState } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import './App.css';
import { encrypt, decrypt, encryptCBC, decryptCBC, generateAESKeyHex, hexToBase64, base64ToHex } from './cryptoUtil';
import { generateAndDownloadZip } from './artifactUtil';
import LibraryPage from './LibraryPage';

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
  const [showArtifactsModal, setShowArtifactsModal] = useState(false);
  const [artifacts, setArtifacts] = useState([
    { jiraTicket: '', apiName: '', env: 'DEV', curl: '', response: '', encryption: 'Disabled', aesKey: '', algo: 'GCM', numRequests: 1, extraRequests: [] }
  ]);
  const [numArtifacts, setNumArtifacts] = useState(1);

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

  const beautifyXML = (xml) => {
    let formatted = '';
    let indent = '';
    const tab = '  ';
    // Remove existing white space between tags
    xml = xml.replace(/>\s*</g, '><');
    xml.split(/>\s*</).forEach((node) => {
      if (node.match(/^\/\w/)) indent = indent.substring(tab.length);
      formatted += indent + '<' + node + '>\r\n';
      if (node.match(/^<?\w[^>]*[^\/]$/)) indent += tab;
    });
    return formatted.trim();
  };

  const handleBeautify = () => {
    if (!outputResult) return;
    setError('');
    const trimmed = outputResult.trim();

    // Try JSON first
    try {
      const jsonObj = JSON.parse(trimmed);
      setOutputResult(JSON.stringify(jsonObj, null, 2));
      return;
    } catch (e) {
      // Not JSON, continue to XML
    }

    // Try XML
    try {
      if (trimmed.startsWith('<')) {
        const formatted = beautifyXML(trimmed);
        setOutputResult(formatted);
      } else {
        throw new Error('Not XML');
      }
    } catch (e) {
      setError('Could not beautify: Invalid JSON or XML');
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

  const handleArtifactCountChange = (count) => {
    const newCount = parseInt(count);
    setNumArtifacts(newCount);
    setArtifacts(prev => {
      const newArtifacts = [...prev];
      if (newCount > prev.length) {
        for (let i = prev.length; i < newCount; i++) {
          newArtifacts.push({ jiraTicket: '', apiName: '', env: 'DEV', curl: '', response: '', encryption: 'Disabled', aesKey: '', algo: 'GCM', numRequests: 1, extraRequests: [] });
        }
      } else {
        return newArtifacts.slice(0, newCount);
      }
      return newArtifacts;
    });
  };

  const updateArtifact = (index, field, value) => {
    setArtifacts(prev => {
      const newArtifacts = [...prev];
      newArtifacts[index] = { ...newArtifacts[index], [field]: value };
      return newArtifacts;
    });
  };

  const handleRequestCountChange = (artifactIndex, count) => {
    const newCount = parseInt(count);
    setArtifacts(prev => {
      const newArtifacts = [...prev];
      const art = newArtifacts[artifactIndex];
      const oldNum = art.numRequests;

      art.numRequests = newCount;
      if (newCount > oldNum) {
        // Add extra requests
        for (let i = oldNum; i < newCount; i++) {
          art.extraRequests.push({ request: '', response: '' });
        }
      } else {
        // Trim extra requests
        art.extraRequests = art.extraRequests.slice(0, newCount - 1);
      }
      return newArtifacts;
    });
  };

  const updateExtraRequest = (artifactIndex, extraIndex, field, value) => {
    setArtifacts(prev => {
      const newArtifacts = [...prev];
      const art = newArtifacts[artifactIndex];
      art.extraRequests[extraIndex] = { ...art.extraRequests[extraIndex], [field]: value };
      return newArtifacts;
    });
  };

  const pushToLibrary = async (artifactsToPush) => {
    try {
      // Add a simple timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database write timed out")), 5000)
      );

      for (const art of artifactsToPush) {
        const writePromise = addDoc(collection(db, 'artifacts'), {
          ...art,
          timestamp: serverTimestamp()
        });

        // Wait for either the write or the timeout
        await Promise.race([writePromise, timeoutPromise]);
      }
    } catch (e) {
      console.error("Error adding to library: ", e);
      // We don't throw here so that the UI can still close even if DB fails
    }
  };

  const handleGenerateArtifacts = async () => {
    setError('');
    const jiraRegex = /^SOA-\d+$/;

    for (let i = 0; i < artifacts.length; i++) {
      const art = artifacts[i];
      if (!jiraRegex.test(art.jiraTicket)) {
        setError(`Artifact ${i + 1}: Invalid Jira Ticket format (expected SOA-XXXX)`);
        return;
      }
      if (!art.apiName.trim() || !art.curl.trim() || !art.response.trim()) {
        setError(`Artifact ${i + 1}: All fields are mandatory`);
        return;
      }
      if (art.encryption === 'Enabled' && !art.aesKey.trim()) {
        setError(`Artifact ${i + 1}: AES Key is mandatory when encryption is enabled`);
        return;
      }
      // Check extra requests
      for (let j = 0; j < art.extraRequests.length; j++) {
        const extra = art.extraRequests[j];
        if (!extra.request.trim() || !extra.response.trim()) {
          setError(`Artifact ${i + 1}: Extra Request/Response ${j + 2} fields are mandatory`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      // 1. Generate ZIP
      await generateAndDownloadZip(artifacts, decrypt, decryptCBC);

      // 2. Try to push to library (background, don't block UI if it fails)
      await pushToLibrary(artifacts);

      setShowArtifactsModal(false);
    } catch (err) {
      setError('Generation failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Routes>
      <Route path="/" element={
        <div className="container">
          <div className="card">
            <h1>AMLI TOOLS</h1>

            <div className="mode-toggle">
              {/* ... existing mode toggle ... */}
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
              <button
                className="toggle-btn"
                onClick={() => setShowArtifactsModal(true)}
              >
                💎 ARTIFACTS
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

            <Link to="/library" className="btn-lib button">
              📚 API LIB
            </Link>

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

            {showArtifactsModal && (
              <div className="modal-overlay" onClick={() => setShowArtifactsModal(false)}>
                <div className="modal-content artifact-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2>Artifacts Generator</h2>
                    <button className="close-modal" onClick={() => setShowArtifactsModal(false)}>&times;</button>
                  </div>
                  <div className="modal-body scrollable">
                    <div className="form-group">
                      <label>Multiple Files</label>
                      <select
                        className="custom-select"
                        value={numArtifacts}
                        onChange={(e) => handleArtifactCountChange(e.target.value)}
                      >
                        {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>

                    {artifacts.map((art, index) => (
                      <div key={index} className="artifact-group">
                        <h3 className="artifact-title">Artifact {index + 1}</h3>
                        <div className="form-row">
                          <div className="form-group flexify">
                            <label>Jira Ticket</label>
                            <input
                              type="text"
                              placeholder="e.g. SOA-1390"
                              value={art.jiraTicket}
                              onChange={(e) => updateArtifact(index, 'jiraTicket', e.target.value)}
                            />
                          </div>
                          <div className="form-group flexify">
                            <label>API Name</label>
                            <input
                              type="text"
                              placeholder="e.g. EmailService"
                              value={art.apiName}
                              onChange={(e) => updateArtifact(index, 'apiName', e.target.value)}
                            />
                          </div>
                          <div className="form-group flexify">
                            <label>ENV</label>
                            <select
                              className="custom-select"
                              value={art.env}
                              onChange={(e) => updateArtifact(index, 'env', e.target.value)}
                            >
                              <option value="DEV">DEV</option>
                              <option value="Digi-Dev">Digi-Dev</option>
                              <option value="UAT">UAT</option>
                              <option value="Pre-Prod">Pre-Prod</option>
                              <option value="PROD">PROD</option>
                              <option value="Digi-Prod">Digi-Prod</option>
                            </select>
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Curl (Request 1)</label>
                          <textarea
                            className="small-area"
                            placeholder="Paste full curl here..."
                            value={art.curl}
                            onChange={(e) => updateArtifact(index, 'curl', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Response 1</label>
                          <textarea
                            className="small-area"
                            placeholder="Paste full response JSON..."
                            value={art.response}
                            onChange={(e) => updateArtifact(index, 'response', e.target.value)}
                          />
                        </div>

                        <div className="form-group">
                          <label>Number of Requests</label>
                          <select
                            className="custom-select"
                            value={art.numRequests}
                            onChange={(e) => handleRequestCountChange(index, e.target.value)}
                          >
                            {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>

                        {art.extraRequests && art.extraRequests.map((extra, eIdx) => (
                          <div key={eIdx} className="extra-request-group">
                            <div className="form-group">
                              <label>Request {eIdx + 2}</label>
                              <textarea
                                className="small-area"
                                placeholder={`Paste request ${eIdx + 2} JSON...`}
                                value={extra.request}
                                onChange={(e) => updateExtraRequest(index, eIdx, 'request', e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label>Response {eIdx + 2}</label>
                              <textarea
                                className="small-area"
                                placeholder={`Paste response ${eIdx + 2} JSON...`}
                                value={extra.response}
                                onChange={(e) => updateExtraRequest(index, eIdx, 'response', e.target.value)}
                              />
                            </div>
                          </div>
                        ))}
                        <div className="form-row">
                          <div className="form-group flexify">
                            <label>Encryption</label>
                            <select
                              className="custom-select"
                              value={art.encryption}
                              onChange={(e) => updateArtifact(index, 'encryption', e.target.value)}
                            >
                              <option value="Disabled">Disabled</option>
                              <option value="Enabled">Enabled</option>
                            </select>
                          </div>
                          {art.encryption === 'Enabled' && (
                            <>
                              <div className="form-group flexify">
                                <label>Mode</label>
                                <select
                                  className="custom-select"
                                  value={art.algo}
                                  onChange={(e) => updateArtifact(index, 'algo', e.target.value)}
                                >
                                  <option value="GCM">AES/GCM/NoPadding</option>
                                  <option value="CBC">AES/CBC/PKCS5Padding</option>
                                </select>
                              </div>
                              <div className="form-group flexify">
                                <label>AES Key</label>
                                <input
                                  type="text"
                                  placeholder="Enter AES Key"
                                  value={art.aesKey}
                                  onChange={(e) => updateArtifact(index, 'aesKey', e.target.value)}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="modal-actions sticky-footer">
                      <button className="btn-primary full-width" onClick={handleGenerateArtifacts} disabled={loading}>
                        {loading ? <div className="loader"></div> : '🚀 Generate & Download ZIP'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="output-container">
              <div className="output-header">
                <label>Output Result</label>
                <div className="header-actions">
                  {outputResult && (
                    <>
                      <button className="copy-btn secondary" onClick={handleBeautify}>
                        ✨ Beautify
                      </button>
                      <button className="copy-btn" onClick={handleCopy}>
                        {copied ? '✓ Copied!' : 'Copy Result'}
                      </button>
                    </>
                  )}
                </div>
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
      } />
      <Route path="/library" element={<LibraryPage />} />
    </Routes>
  );
}

export default App;
